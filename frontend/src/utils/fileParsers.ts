import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { DayEndLineInput, PurchaseLineInput } from "../api/types";

async function parseFile(file: File): Promise<Record<string, unknown>[]> {
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
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
}

function normalizeRow(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, "_");
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

export async function parsePurchaseUpload(file: File): Promise<ParsedLine<PurchaseLineInput>[]> {
  const rows = await parseFile(file);
  return rows.map((row, index) => {
    const normalized = normalizeRow(row);
    const issues: string[] = [];
    const quantity = Number(normalized.quantity_units ?? normalized.qty ?? normalized.quantity ?? 0);
    if (!quantity || Number.isNaN(quantity)) {
      issues.push("Missing quantity");
    }
    const mrp = Number(normalized.mrp_price ?? normalized.mrp ?? 0);
    if (!mrp || Number.isNaN(mrp)) {
      issues.push("Missing MRP");
    }
    const unitCost = Number(normalized.unit_cost_price ?? normalized.cost ?? mrp);
    if (Number.isNaN(unitCost)) {
      issues.push("Invalid cost price");
    }
    const sku = String(normalized.sku ?? "").trim();
    const name = String(normalized.item_name ?? normalized.name ?? "").trim();
    if (!sku && !name) {
      issues.push("Need SKU or item name");
    }
    const payload: PurchaseLineInput = {
      sku: sku || undefined,
      name: name || undefined,
      brand: (normalized.brand as string) || undefined,
      category: (normalized.category as string) || undefined,
      mrpPrice: mrp,
      unitCostPrice: unitCost || mrp,
      quantityUnits: quantity || 0,
      volumeMl: normalized.volume_ml ? Number(normalized.volume_ml) : undefined,
      reorderLevel: normalized.reorder_level ? Number(normalized.reorder_level) : undefined,
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
    const sku = String(normalized.sku ?? "").trim();
    const name = String(normalized.item_name ?? normalized.name ?? "").trim();
    if (!sku && !name) {
      issues.push("Need SKU or item name");
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
      rawName: name,
    };
  });
}
