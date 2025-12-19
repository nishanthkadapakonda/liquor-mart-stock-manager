import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { DayEndLineInput, PurchaseLineInput } from "../api/types";

// Security: Limit file size to prevent ReDoS attacks (10MB max)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function parseFile(file: File): Promise<Record<string, unknown>[]> {
  // Validate file size to prevent ReDoS
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: (error) => reject(error),
      });
    });
  }

  const buffer = await file.arrayBuffer();
  
  // Security: Add options to mitigate prototype pollution
  const workbook = XLSX.read(buffer, { 
    type: "array",
    cellDates: false, // Disable date parsing to reduce attack surface
    cellNF: false, // Disable number format parsing
    cellStyles: false, // Disable style parsing
    sheetStubs: false, // Disable stub sheets
  });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Excel file contains no sheets");
  }
  
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Security: Use sheet_to_json with safe options and sanitize output
  const rawData = XLSX.utils.sheet_to_json(sheet, { 
    defval: "",
    raw: false, // Convert all values to strings/numbers to prevent prototype pollution
  }) as Record<string, unknown>[];
  
  // Security: Sanitize each row to prevent prototype pollution
  return rawData.map((row) => {
    // Create a new object without prototype chain
    const sanitized = Object.create(null);
    for (const [key, value] of Object.entries(row)) {
      // Only allow safe keys (alphanumeric, underscore, dash)
      const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
      sanitized[safeKey] = value;
    }
    return sanitized;
  });
}

function normalizeRow(row: Record<string, unknown>) {
  // Security: Use Object.create(null) to prevent prototype pollution
  const normalized = Object.create(null);
  Object.entries(row).forEach(([key, value]) => {
    // Sanitize key to prevent prototype pollution
    const cleanKey = key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    
    // Prevent setting __proto__ or constructor
    if (cleanKey === '__proto__' || cleanKey === 'constructor' || cleanKey === 'prototype') {
      return; // Skip dangerous keys
    }
    
    normalized[cleanKey] = value;
  });
  return normalized;
}

export interface ParsedLine<T> {
  payload: T;
  issues: string[];
  row: number;
  rawName?: string;
}

function stringOrEmpty(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function numberOrZero(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") {
    return Number.isNaN(value) ? 0 : value;
  }
  const cleaned = String(value).replace(/,/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parsePackLabel(label: string) {
  if (!label) {
    return {
      label: undefined as string | undefined,
      unitsPerPack: undefined as number | undefined,
      volumeMl: undefined as number | undefined,
    };
  }
  const cleaned = label.replace(/\s+/g, "");
  const segments = cleaned.split("/");
  const parsedUnits = segments.length > 1 ? Number(segments[0]) : Number(cleaned);
  const unitsPerPack = Number.isNaN(parsedUnits) ? undefined : parsedUnits;
  const sizeToken = segments[1] ?? "";
  const sizeMatch = sizeToken.match(/([\d.]+)(ml|l)/i);
  let volumeMl: number | undefined;
  if (sizeMatch) {
    const qty = Number(sizeMatch[1]);
    const unit = sizeMatch[2]?.toLowerCase();
    if (!Number.isNaN(qty)) {
      volumeMl = unit === "l" ? qty * 1000 : qty;
    }
  }
  return {
    label: label.trim() || undefined,
    unitsPerPack,
    volumeMl,
  };
}

export async function parsePurchaseUpload(file: File): Promise<ParsedLine<PurchaseLineInput>[]> {
  const rows = await parseFile(file);
  return rows.map((row, index) => {
    const normalized = normalizeRow(row);
    const issues: string[] = [];
    const brandNumber = stringOrEmpty(
      normalized.brand_no ?? normalized.brand_number ?? normalized.brandcode ?? normalized.brand_id,
    );
    if (!brandNumber) {
      issues.push("Missing brand number");
    }
    const brandName = stringOrEmpty(normalized.brand_name ?? normalized.item_name ?? normalized.name);
    if (!brandName) {
      issues.push("Missing brand name");
    }
    const productType = stringOrEmpty(normalized.product_type ?? normalized.category ?? normalized.type);
    if (!productType) {
      issues.push("Missing product type");
    }
    const sizeCode = stringOrEmpty(normalized.size_code ?? normalized.size);
    if (!sizeCode) {
      issues.push("Missing size code");
    }
    const packLabelRaw = stringOrEmpty(
      normalized.pack_qty_size_ml ??  // "Pack qty / Size(ml)"
      normalized.pack_qty_size ??     // "Pack qty / Size"
      normalized.pack_qty ??          // "Pack/Qty" or "Pack Qty"
      normalized.pack_size_ml ??      // "Pack Size(ml)"
      normalized.pack_size ??         // "Pack Size"
      normalized.pack,
    );
    const packInfo = parsePackLabel(packLabelRaw);
    if (!packInfo.unitsPerPack) {
      issues.push("Invalid pack quantity");
    }
    const packType = stringOrEmpty(normalized.pack_type ?? normalized.issue_type)?.toUpperCase();
    const casesQuantity = numberOrZero(
      normalized.quantity_in_cases ?? // "Quantity(In Cases)"
      normalized.qty_cases ?? 
      normalized.quantity_cases ?? 
      normalized.cases ?? 
      normalized.qty,
    );
    if (!casesQuantity) {
      issues.push("Missing cases quantity");
    }
    const issuePrice = numberOrZero(
      normalized.issue_price ?? normalized.case_price ?? normalized.cost_price ?? normalized.price,
    );
    if (!issuePrice) {
      issues.push("Missing issue price");
    }
    const totalPrice = numberOrZero(
      normalized.total_price ?? normalized.line_total ?? normalized.amount ?? issuePrice * casesQuantity,
    );
    const unitsPerPack = packInfo.unitsPerPack ?? numberOrZero(normalized.units_per_pack);
    if (!unitsPerPack) {
      issues.push("Pack quantity is required");
    }
    const quantityUnits = unitsPerPack * casesQuantity;
    if (!quantityUnits) {
      issues.push("Computed units missing");
    }
    const unitCostPrice =
      unitsPerPack > 0 ? Number((issuePrice / unitsPerPack).toFixed(4)) : numberOrZero(normalized.unit_cost_price);
    if (!unitCostPrice) {
      issues.push("Derived cost per unit missing");
    }
    // MRP is optional - if not provided, backend will use existing item's MRP or default to cost
    const mrpRaw = numberOrZero(normalized.mrp_price ?? normalized.mrp ?? normalized.mrp_per_unit);
    const mrp = mrpRaw > 0 ? mrpRaw : unitCostPrice; // Default to cost if no MRP column
    // Generate SKU from Brand No + Size Code + Issue Type for uniqueness
    const skuParts = [brandNumber, sizeCode, packType]
      .filter((part): part is string => Boolean(part))
      .map((part) => part.trim().replace(/\s+/g, "").toUpperCase());
    const sku =
      stringOrEmpty(normalized.sku) ||
      (skuParts.length >= 2 ? skuParts.join("-") : undefined);
    const payload: PurchaseLineInput = {
      sku,
      name: brandName || undefined,
      brand: brandName || undefined,
      brandNumber: brandNumber || undefined,
      productType: productType || undefined,
      sizeCode: sizeCode || undefined,
      packType: packType || undefined,
      packSizeLabel: packInfo.label,
      unitsPerPack,
      casesQuantity,
      category: productType || undefined,
      volumeMl: packInfo.volumeMl,
      mrpPrice: mrp,
      unitCostPrice,
      caseCostPrice: issuePrice,
      lineTotalPrice: totalPrice,
      quantityUnits,
    };

    return {
      payload,
      issues,
      row: index + 2,
      rawName: payload.name,
    };
  });
}

export async function parseDayEndUpload(file: File): Promise<ParsedLine<DayEndLineInput>[]> {
  const rows = await parseFile(file);
  return rows.map((row, index) => {
    const normalized = normalizeRow(row);
    const issues: string[] = [];
    const quantity = Number(
      normalized.quantity_sold_units ?? normalized.quantity ?? normalized.qty ?? 0,
    );
    if (!quantity || Number.isNaN(quantity)) {
      issues.push("Missing quantity");
    }
    const channelRaw = String(normalized.channel ?? normalized.sale_channel ?? "").toUpperCase();
    const channel = channelRaw === "BELT" ? "BELT" : "RETAIL";
    if (!channelRaw) {
      issues.push("Missing channel");
    }
    
    // Try to get SKU directly, or generate from brand_number + size_code + pack_type
    let sku = String(normalized.sku ?? "").trim();
    
    if (!sku) {
      // Try to generate SKU from component fields
      const brandNumber = String(normalized.brand_number ?? normalized.brandnumber ?? "").trim().toUpperCase();
      const sizeCode = String(normalized.size_code ?? normalized.sizecode ?? normalized.size ?? "").trim().toUpperCase();
      const packType = String(normalized.pack_type ?? normalized.packtype ?? normalized.pack ?? "").trim().toUpperCase();
      
      if (brandNumber && sizeCode && packType) {
        sku = `${brandNumber}-${sizeCode}-${packType}`.replace(/\s+/g, "");
      } else if (brandNumber && sizeCode) {
        // Try with just brand number and size code
        sku = `${brandNumber}-${sizeCode}`.replace(/\s+/g, "");
      }
    }
    
    const name = String(normalized.item_name ?? normalized.name ?? normalized.brand_name ?? normalized.brandname ?? "").trim();
    if (!sku && !name) {
      issues.push("Need SKU or Brand Number + Size Code");
    }
    const sellingPrice = normalized.selling_price_per_unit
      ? Number(normalized.selling_price_per_unit)
      : undefined;

    const payload: DayEndLineInput = {
      sku: sku || undefined,
      channel,
      quantitySoldUnits: quantity || 0,
      sellingPricePerUnit: sellingPrice,
    };

    return {
      payload,
      issues,
      row: index + 2,
      rawName: name || sku,
    };
  });
}
