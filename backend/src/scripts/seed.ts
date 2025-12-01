import dayjs from "dayjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ensureBootstrapData } from "../services/bootstrapService";
import type { SalesChannel } from "../types/domain";

type SeededItem = Awaited<ReturnType<typeof prisma.item.upsert>>;

async function main() {
  await ensureBootstrapData();

  const itemSeeds = [
    {
      sku: "WH-1001",
      name: "Highland Gold Whisky",
      brand: "Highland",
      category: "Whisky",
      volumeMl: 750,
      mrpPrice: 1800,
      purchaseCostPrice: 1400,
      currentStockUnits: 120,
      reorderLevel: 40,
    },
    {
      sku: "VD-2201",
      name: "Crystal Clear Vodka",
      brand: "Crystal",
      category: "Vodka",
      volumeMl: 750,
      mrpPrice: 1500,
      purchaseCostPrice: 1100,
      currentStockUnits: 90,
      reorderLevel: 30,
    },
    {
      sku: "RM-3301",
      name: "Island Breeze Rum",
      brand: "Island",
      category: "Rum",
      volumeMl: 750,
      mrpPrice: 1300,
      purchaseCostPrice: 950,
      currentStockUnits: 70,
      reorderLevel: 25,
    },
  ];

  const items: SeededItem[] = [];
  for (const seed of itemSeeds) {
    const item = await prisma.item.upsert({
      where: { sku: seed.sku },
      update: {
        ...seed,
        mrpPrice: new Prisma.Decimal(seed.mrpPrice),
        purchaseCostPrice: new Prisma.Decimal(seed.purchaseCostPrice),
      },
      create: {
        ...seed,
        mrpPrice: new Prisma.Decimal(seed.mrpPrice),
        purchaseCostPrice: new Prisma.Decimal(seed.purchaseCostPrice),
      },
    });
    items.push(item);
  }

  const hasPurchases = await prisma.purchase.count();
  if (!hasPurchases) {
    const purchase = await prisma.purchase.create({
      data: {
        purchaseDate: dayjs().subtract(5, "day").toDate(),
        supplierName: "Metro Liquor Suppliers",
        notes: "Initial stock top-up",
      },
    });

    for (const item of items) {
      const qty = 20;
      await prisma.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId: item.id,
          quantityUnits: qty,
          unitCostPrice: item.purchaseCostPrice ?? new Prisma.Decimal(1000),
          mrpPriceAtPurchase: item.mrpPrice,
        },
      });
      await prisma.item.update({
        where: { id: item.id },
        data: {
          currentStockUnits: { increment: qty },
        },
      });
    }
  }

  const reportDate = dayjs().subtract(1, "day").startOf("day");
  const existingReport = await prisma.dayEndReport.findUnique({
    where: { reportDate: reportDate.toDate() },
  });

  if (!existingReport) {
    const [whisky, vodka, rum] = items;
    if (!whisky || !vodka || !rum) {
      throw new Error("Items failed to seed correctly");
    }

    const beltMarkup = 20;
    const lines: Array<{
      itemId: number;
      channel: SalesChannel;
      quantitySoldUnits: number;
    }> = [
      {
        itemId: whisky.id,
        channel: "RETAIL",
        quantitySoldUnits: 10,
      },
      {
        itemId: vodka.id,
        channel: "BELT",
        quantitySoldUnits: 8,
      },
      {
        itemId: rum.id,
        channel: "RETAIL",
        quantitySoldUnits: 5,
      },
    ];

    await prisma.dayEndReport.create({
      data: {
        reportDate: reportDate.toDate(),
        beltMarkupRupees: new Prisma.Decimal(beltMarkup),
        notes: "Sample day-end sales",
        lines: {
          create: lines.map((line) => {
            const item = items.find((i) => i.id === line.itemId)!;
            const mrpPrice = Number(item.mrpPrice);
            const sellingPrice = line.channel === "RETAIL" ? mrpPrice : mrpPrice + beltMarkup;
            return {
              itemId: line.itemId,
              channel: line.channel,
              quantitySoldUnits: line.quantitySoldUnits,
              mrpPrice: item.mrpPrice,
              sellingPricePerUnit: new Prisma.Decimal(sellingPrice),
              lineRevenue: new Prisma.Decimal(sellingPrice * line.quantitySoldUnits),
            };
          }),
        },
      },
    });

    for (const line of lines) {
      await prisma.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { decrement: line.quantitySoldUnits },
        },
      });
    }
  }

  console.log("Seed completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
