import { prisma } from "../prisma";
import * as fs from "fs";
import * as path from "path";

async function generateDayEndTemplate() {
  // Get a few active items with stock to use as examples
  const items = await prisma.item.findMany({
    where: {
      isActive: true,
      currentStockUnits: { gt: 0 },
    },
    take: 5,
    orderBy: { name: "asc" },
  });

  if (items.length === 0) {
    console.log("No items found in database. Please add items first.");
    return;
  }

  // Generate CSV content
  const header = "sku,channel,quantity_sold_units,selling_price_per_unit\n";
  const rows = items.map((item) => {
    // Use a small quantity (1-3) as example
    const qty = Math.min(3, Math.floor(item.currentStockUnits / 4) || 1);
    // Alternate between RETAIL and BELT
    const channel = items.indexOf(item) % 2 === 0 ? "RETAIL" : "BELT";
    // Use MRP as example selling price (optional, so sometimes leave empty)
    const price = items.indexOf(item) % 3 !== 0 ? Number(item.mrpPrice) : "";
    return `${item.sku},${channel},${qty},${price}`;
  });

  const csv = header + rows.join("\n");
  
  // Write to template file
  const templatePath = path.join(__dirname, "../../../frontend/public/samples/day-end-template.csv");
  fs.writeFileSync(templatePath, csv, "utf-8");
  
  console.log(`\n✅ Template generated successfully with ${items.length} real items from your database!`);
  console.log(`📁 File saved to: ${templatePath}\n`);
  console.log("Template preview:");
  console.log(csv);
}

generateDayEndTemplate()
  .catch((error) => {
    console.error("Error generating template:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

