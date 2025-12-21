import { ChangeEvent, FormEvent, Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../api/client";
import type { Purchase, PurchaseLineInput } from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { parsePurchaseUpload, type ParsedLine } from "../utils/fileParsers";
import { useAuth } from "../providers/AuthProvider";
import { LoadingButton } from "../components/common/LoadingButton";
import { PageLoader } from "../components/common/PageLoader";
import { Spinner } from "../components/common/Spinner";
import { parseDate, formatDateInput } from "../utils/dateUtils";

// Helper function to round to 4 decimal places without floating-point errors
function roundTo4Decimals(value: number): number {
  return Number(Number(value).toFixed(4));
}

interface ManualLine {
  id: string;
  itemId?: number;
  sku: string;
  name: string;
  brandNumber: string;
  productType: string;
  sizeCode: string;
  packType: string;
  packSizeLabel: string;
  unitsPerPack: string;
  casesQuantity: string;
  looseUnits: string;                      // Individual units not in complete cases
  quantityUnits: string;
  mrpPrice: string;
  unitCostPrice: string;
  caseCostPrice: string;
  lineTotalPrice: string;
}

function emptyLine(): ManualLine {
  return {
    id: crypto.randomUUID(),
    itemId: undefined,
    sku: "",
    name: "",
    brandNumber: "",
    productType: "",
    sizeCode: "",
    packType: "",
    packSizeLabel: "",
    unitsPerPack: "",
    casesQuantity: "",
    looseUnits: "",
    quantityUnits: "",
    mrpPrice: "",
    unitCostPrice: "",
    caseCostPrice: "",
    lineTotalPrice: "",
  };
}

type PurchaseFilter =
  | { kind: "LAST_30" | "LAST_60"; startDate: string; endDate: string }
  | { kind: "CUSTOM"; startDate: string; endDate: string }
  | { kind: "ALL" };

const quickFilterCards = [
  {
    kind: "LAST_30",
    label: "Last 30 days",
    description: "Invoices from the past month",
    days: 30,
  },
  {
    kind: "LAST_60",
    label: "Last 60 days",
    description: "Two months of history",
    days: 60,
  },
  {
    kind: "ALL",
    label: "View all",
    description: "Complete purchase history",
  },
] as const;

function buildDateRange(days: number) {
  const endDate = dayjs().format("YYYY-MM-DD");
  return {
    startDate: dayjs().subtract(days - 1, "day").format("YYYY-MM-DD"),
    endDate,
  };
}

// Auto-generate SKU from composite key fields
function deriveSku(brandNumber: string, sizeCode: string, packType: string): string {
  const parts = [brandNumber, sizeCode, packType]
    .filter((part) => part && part.trim())
    .map((part) => part.trim().replace(/\s+/g, "").toUpperCase());
  return parts.length >= 2 ? parts.join("-") : "";
}

export function PurchasesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "ADMIN";
  const [purchaseDate, setPurchaseDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [miscellaneousCharges, setMiscellaneousCharges] = useState("");
  const [manualLines, setManualLines] = useState<ManualLine[]>([emptyLine()]);
  const [importPreview, setImportPreview] = useState<ParsedLine<PurchaseLineInput>[]>();
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importDate, setImportDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [importSupplier, setImportSupplier] = useState("");
  const [importTaxAmount, setImportTaxAmount] = useState("");
  const [importMiscellaneousCharges, setImportMiscellaneousCharges] = useState("");
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [activeFilter, setActiveFilter] = useState<PurchaseFilter>(() => {
    const range = buildDateRange(30);
    return { kind: "LAST_30", ...range };
  });
  const [customRange, setCustomRange] = useState(() => buildDateRange(30));
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<number | null>(null);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<number | null>(null);

  const purchasesQuery = useQuery({
    queryKey: ["purchases", activeFilter.kind, activeFilter.startDate ?? "NA", activeFilter.endDate ?? "NA"],
    queryFn: async () => {
      const params =
        activeFilter.kind === "ALL"
          ? undefined
          : {
              startDate: activeFilter.startDate,
              endDate: activeFilter.endDate,
            };
      const response = await api.get<{ purchases: Purchase[] }>("/purchases", {
        params,
      });
      return response.data.purchases;
    },
  });

  const manualTotal = useMemo(() => {
    const quantity = manualLines.reduce(
      (sum, line) => sum + Number(line.quantityUnits || 0),
      0,
    );
    return quantity;
  }, [manualLines]);

  const activeFilterLabel = useMemo(() => {
    switch (activeFilter.kind) {
      case "LAST_30":
        return "last 30 days";
      case "LAST_60":
        return "last 60 days";
      case "ALL":
        return "entire history";
      case "CUSTOM":
        return `${dayjs(activeFilter.startDate).format("DD MMM YYYY")} – ${dayjs(activeFilter.endDate).format("DD MMM YYYY")}`;
      default:
        return "";
    }
  }, [activeFilter]);

  const applyFilter = (filter: PurchaseFilter) => {
    setActiveFilter(filter);
    setExpandedPurchaseId(null);
  };

  const handleQuickFilter = (kind: (typeof quickFilterCards)[number]["kind"]) => {
    const card = quickFilterCards.find((entry) => entry.kind === kind);
    if (!card) return;
    if (card.kind === "ALL") {
      applyFilter({ kind: "ALL" });
      return;
    }
    const range = buildDateRange(card.days ?? 30);
    applyFilter({ kind: card.kind, ...range });
  };

  const handleCustomView = () => {
    if (!customRange.startDate || !customRange.endDate) {
      toast.error("Select both start and end dates");
      return;
    }
    if (dayjs(customRange.endDate).isBefore(customRange.startDate)) {
      toast.error("End date must be after the start date");
      return;
    }
    applyFilter({ kind: "CUSTOM", startDate: customRange.startDate, endDate: customRange.endDate });
  };

  const resetManualForm = () => {
    setManualLines([emptyLine()]);
    setSupplierName("");
    setNotes("");
    setTaxAmount("");
    setMiscellaneousCharges("");
    setPurchaseDate(dayjs().format("YYYY-MM-DD"));
    setEditingPurchase(null);
  };

  // Fields that identify a product - changing any of these should clear itemId
  // to avoid sending conflicting data to the backend
  const productIdentifyingFields: (keyof ManualLine)[] = [
    "sku",
    "name",
    "brandNumber",
    "productType",
    "sizeCode",
    "packType",
    "packSizeLabel",
  ];

  const handleManualChange = (id: string, key: keyof ManualLine, value: string) => {
    setManualLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        
        const updated = {
          ...line,
          [key]: value,
          ...(productIdentifyingFields.includes(key) ? { itemId: undefined } : {}),
        };
        
        // Auto-fill SKU when composite key fields change
        const skuFields: (keyof ManualLine)[] = ["brandNumber", "sizeCode", "packType"];
        if (skuFields.includes(key)) {
          updated.sku = deriveSku(updated.brandNumber, updated.sizeCode, updated.packType);
        }
        
        // Auto-calculate prices based on what changed
        const numValue = value !== "" ? Number(value) : 0;
        const quantityUnits = updated.quantityUnits !== "" ? Number(updated.quantityUnits) : 0;
        const casesQuantity = updated.casesQuantity !== "" ? Number(updated.casesQuantity) : 0;
        const looseUnits = updated.looseUnits !== "" ? Number(updated.looseUnits) : 0;
        const unitsPerPack = updated.unitsPerPack !== "" ? Number(updated.unitsPerPack) : 0;
        const unitCostPrice = updated.unitCostPrice !== "" ? Number(updated.unitCostPrice) : 0;
        const caseCostPrice = updated.caseCostPrice !== "" ? Number(updated.caseCostPrice) : 0;
        const lineTotalPrice = updated.lineTotalPrice !== "" ? Number(updated.lineTotalPrice) : 0;
        
        // When lineTotalPrice changes: calculate unitCostPrice and caseCostPrice
        if (key === "lineTotalPrice" && numValue > 0) {
          if (quantityUnits > 0) {
            updated.unitCostPrice = roundTo4Decimals(numValue / quantityUnits).toFixed(4);
          }
          if (casesQuantity > 0) {
            updated.caseCostPrice = roundTo4Decimals(numValue / casesQuantity).toFixed(4);
          }
        }
        
        // When unitCostPrice changes: calculate caseCostPrice and lineTotalPrice
        else if (key === "unitCostPrice" && numValue > 0) {
          if (unitsPerPack > 0) {
            updated.caseCostPrice = roundTo4Decimals(numValue * unitsPerPack).toFixed(4);
          }
          if (quantityUnits > 0) {
            updated.lineTotalPrice = roundTo4Decimals(numValue * quantityUnits).toFixed(4);
          }
        }
        
        // When caseCostPrice changes: calculate unitCostPrice and lineTotalPrice
        else if (key === "caseCostPrice" && numValue > 0) {
          if (unitsPerPack > 0) {
            updated.unitCostPrice = roundTo4Decimals(numValue / unitsPerPack).toFixed(4);
          }
          if (casesQuantity > 0) {
            updated.lineTotalPrice = roundTo4Decimals(numValue * casesQuantity).toFixed(4);
          }
        }
        
        // When quantityUnits changes: recalculate lineTotalPrice
        else if (key === "quantityUnits") {
          if (numValue > 0 && unitCostPrice > 0) {
            updated.lineTotalPrice = roundTo4Decimals(unitCostPrice * numValue).toFixed(4);
          } else if (numValue > 0 && caseCostPrice > 0 && unitsPerPack > 0) {
            // Calculate from case cost
            const calculatedUnitCost = roundTo4Decimals(caseCostPrice / unitsPerPack);
            updated.lineTotalPrice = roundTo4Decimals(calculatedUnitCost * numValue).toFixed(4);
            if (!updated.unitCostPrice || updated.unitCostPrice === "") {
              updated.unitCostPrice = calculatedUnitCost.toFixed(4);
            }
          } else if (numValue === 0) {
            updated.lineTotalPrice = "";
          }
        }
        
        // When casesQuantity changes: recalculate lineTotalPrice and quantityUnits
        else if (key === "casesQuantity") {
          if (numValue > 0 && caseCostPrice > 0) {
            // Calculate total: (cases * caseCostPrice) + (looseUnits * unitCostPrice)
            const looseUnitsValue = looseUnits > 0 ? looseUnits : 0;
            const casesTotal = roundTo4Decimals(caseCostPrice * numValue);
            const looseTotal = looseUnitsValue > 0 ? roundTo4Decimals(unitCostPrice * looseUnitsValue) : 0;
            updated.lineTotalPrice = roundTo4Decimals(casesTotal + looseTotal).toFixed(4);
          } else if (numValue > 0 && unitCostPrice > 0 && unitsPerPack > 0) {
            // Calculate from unit cost
            const calculatedCaseCost = roundTo4Decimals(unitCostPrice * unitsPerPack);
            const looseUnitsValue = looseUnits > 0 ? looseUnits : 0;
            const casesTotal = roundTo4Decimals(calculatedCaseCost * numValue);
            const looseTotal = looseUnitsValue > 0 ? roundTo4Decimals(unitCostPrice * looseUnitsValue) : 0;
            updated.lineTotalPrice = roundTo4Decimals(casesTotal + looseTotal).toFixed(4);
            if (!updated.caseCostPrice || updated.caseCostPrice === "") {
              updated.caseCostPrice = calculatedCaseCost.toFixed(4);
            }
          }
          // Auto-calculate quantityUnits if unitsPerPack is available
          if (numValue > 0 && unitsPerPack > 0) {
            const looseUnitsValue = looseUnits > 0 ? looseUnits : 0;
            updated.quantityUnits = String((numValue * unitsPerPack) + looseUnitsValue);
          } else if (numValue === 0 && looseUnits === 0) {
            updated.quantityUnits = "";
            updated.lineTotalPrice = "";
          } else if (numValue === 0 && looseUnits > 0) {
            updated.quantityUnits = String(looseUnits);
          }
        }
        
        // When looseUnits changes: recalculate lineTotalPrice and quantityUnits
        else if (key === "looseUnits") {
          const casesValue = casesQuantity > 0 ? casesQuantity : 0;
          const looseValue = numValue;
          
          // Calculate total quantityUnits
          if (unitsPerPack > 0 && casesValue > 0) {
            updated.quantityUnits = String((casesValue * unitsPerPack) + looseValue);
          } else if (looseValue > 0) {
            updated.quantityUnits = String(looseValue);
          } else {
            updated.quantityUnits = String(casesValue * unitsPerPack);
          }
          
          // Calculate lineTotalPrice
          if (looseValue > 0 && unitCostPrice > 0) {
            const looseTotal = roundTo4Decimals(unitCostPrice * looseValue);
            const casesTotal = casesValue > 0 && caseCostPrice > 0 
              ? roundTo4Decimals(caseCostPrice * casesValue)
              : 0;
            updated.lineTotalPrice = roundTo4Decimals(casesTotal + looseTotal).toFixed(4);
          } else if (looseValue === 0 && casesValue > 0 && caseCostPrice > 0) {
            updated.lineTotalPrice = roundTo4Decimals(caseCostPrice * casesValue).toFixed(4);
          } else if (looseValue === 0 && casesValue === 0) {
            updated.lineTotalPrice = "";
          }
        }
        
        // When unitsPerPack changes: recalculate caseCostPrice and quantityUnits
        else if (key === "unitsPerPack") {
          if (numValue > 0 && unitCostPrice > 0) {
            updated.caseCostPrice = roundTo4Decimals(unitCostPrice * numValue).toFixed(4);
          } else if (numValue > 0 && caseCostPrice > 0) {
            updated.unitCostPrice = roundTo4Decimals(caseCostPrice / numValue).toFixed(4);
          }
          // Auto-calculate quantityUnits: (casesQuantity * unitsPerPack) + looseUnits
          const casesValue = casesQuantity > 0 ? casesQuantity : 0;
          const looseValue = looseUnits > 0 ? looseUnits : 0;
          if (numValue > 0 && casesValue > 0) {
            updated.quantityUnits = String((casesValue * numValue) + looseValue);
          } else if (looseValue > 0) {
            updated.quantityUnits = String(looseValue);
          }
        }
        
        return updated;
      }),
    );
  };

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    
    const payloadLines = manualLines
      .filter((line) => line.sku || line.name || line.brandNumber)
      .map((line) => {
        const unitsPerPack = line.unitsPerPack !== "" ? Number(line.unitsPerPack) : undefined;
        const casesQuantity = line.casesQuantity !== "" ? Number(line.casesQuantity) : undefined;
        const looseUnits = line.looseUnits !== "" ? Number(line.looseUnits) : undefined;
        // Calculate quantityUnits: (cases * unitsPerPack) + looseUnits
        const quantityUnits = line.quantityUnits !== ""
          ? Number(line.quantityUnits)
          : unitsPerPack !== undefined && casesQuantity !== undefined
            ? (unitsPerPack * casesQuantity) + (looseUnits ?? 0)
            : looseUnits !== undefined
              ? looseUnits
              : 0;
        const unitCostPrice = roundTo4Decimals(Number(line.unitCostPrice || line.mrpPrice || 0));
        const caseCostPrice = line.caseCostPrice !== "" ? roundTo4Decimals(Number(line.caseCostPrice)) : undefined;
        const lineTotalPrice = line.lineTotalPrice !== "" ? roundTo4Decimals(Number(line.lineTotalPrice)) : undefined;
        return {
          itemId: line.itemId,
          sku: line.sku || undefined,
          name: line.name || undefined,
          brandNumber: line.brandNumber || undefined,
          productType: line.productType || undefined,
          sizeCode: line.sizeCode || undefined,
          packType: line.packType || undefined,
          packSizeLabel: line.packSizeLabel || undefined,
          unitsPerPack,
          casesQuantity,
          looseUnits, // Include looseUnits in payload (backend will use it to calculate but not store)
          quantityUnits,
          mrpPrice: Number(line.mrpPrice || 0),
          unitCostPrice,
          caseCostPrice,
          lineTotalPrice,
        };
      });

    if (payloadLines.length === 0) {
      toast.error("Add at least one line item");
      setIsSubmitting(false);
      return;
    }

    // Validate each line has required fields
    for (let i = 0; i < payloadLines.length; i++) {
      const line = payloadLines[i];
      const lineNum = i + 1;

      // Name is ALWAYS required for new items (backend needs it to create items)
      // Even if brandNumber+sizeCode is provided, if no match is found, name is needed
      if (!line.itemId && !line.name) {
        toast.error(`Line ${lineNum}: Brand Name is required to create new items`);
        setIsSubmitting(false);
        return;
      }

      // Quantity must be positive
      if (!line.quantityUnits || line.quantityUnits <= 0) {
        toast.error(`Line ${lineNum}: Quantity must be greater than 0`);
        setIsSubmitting(false);
        return;
      }

      // MRP is required
      if (line.mrpPrice === undefined || line.mrpPrice < 0) {
        toast.error(`Line ${lineNum}: MRP price is required`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      if (editingPurchase) {
        await api.put(`/purchases/${editingPurchase.id}`, {
          purchaseDate,
          supplierName: supplierName || undefined,
          notes: notes || undefined,
          taxAmount: taxAmount ? roundTo4Decimals(Number(taxAmount)) : undefined,
          miscellaneousCharges: miscellaneousCharges ? roundTo4Decimals(Number(miscellaneousCharges)) : undefined,
          lineItems: payloadLines,
          allowItemCreation: true,
        });
        toast.success("Purchase updated - items updated");
      } else {
        await api.post("/purchases", {
          purchaseDate,
          supplierName: supplierName || undefined,
          notes: notes || undefined,
          taxAmount: taxAmount ? roundTo4Decimals(Number(taxAmount)) : undefined,
          miscellaneousCharges: miscellaneousCharges ? roundTo4Decimals(Number(miscellaneousCharges)) : undefined,
          lineItems: payloadLines,
          allowItemCreation: true,
        });
        toast.success("Purchase saved - items updated");
      }
      resetManualForm();
      purchasesQuery.refetch();
      // Invalidate items queries so Items page fetches fresh data
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parsePurchaseUpload(file);
      setImportPreview(parsed);
      setImportFileName(file.name);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const importSummary = useMemo(() => {
    if (!importPreview) return { quantity: 0, cases: 0, value: 0, linesWithIssues: 0 };
    const quantity = importPreview.reduce((sum, row) => sum + (row.payload.quantityUnits ?? 0), 0);
    const cases = importPreview.reduce((sum, row) => sum + (row.payload.casesQuantity ?? 0), 0);
    const value = importPreview.reduce((sum, row) => {
      const lineValue =
        row.payload.lineTotalPrice ??
        (row.payload.unitCostPrice ?? 0) * (row.payload.quantityUnits ?? 0);
      return sum + lineValue;
    }, 0);
    const linesWithIssues = importPreview.filter((row) => row.issues.length > 0).length;
    return { quantity, cases, value, linesWithIssues };
  }, [importPreview]);

  const handleImportSubmit = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setIsImporting(true);
    try {
      await api.post("/purchases/import", {
        purchaseDate: importDate,
        supplierName: importSupplier,
        taxAmount: importTaxAmount ? roundTo4Decimals(Number(importTaxAmount)) : undefined,
        miscellaneousCharges: importMiscellaneousCharges ? roundTo4Decimals(Number(importMiscellaneousCharges)) : undefined,
        lineItems: importPreview.map((line) => line.payload),
        allowItemCreation: true,
      });
      toast.success("Import completed - items updated");
      setImportPreview(undefined);
      setImportFileName(null);
      setImportSupplier("");
      setImportTaxAmount("");
      setImportMiscellaneousCharges("");
      purchasesQuery.refetch();
      // Invalidate items queries so Items page fetches fresh data
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  const handleEditPurchase = async (purchaseId: number) => {
    try {
      const response = await api.get<{ purchase: Purchase }>(`/purchases/${purchaseId}`);
      const purchase = response.data.purchase;
      
      setEditingPurchase(purchase);
      setPurchaseDate(formatDateInput(purchase.purchaseDate));
      setSupplierName(purchase.supplierName ?? "");
      setNotes(purchase.notes ?? "");
      
      // Handle taxAmount - convert to string for input field with proper rounding
      const taxValue = purchase.taxAmount;
      if (taxValue === null || taxValue === undefined) {
        setTaxAmount("");
      } else {
        const taxNum = typeof taxValue === "string" ? parseFloat(taxValue) : Number(taxValue);
        if (!isNaN(taxNum) && taxNum !== 0) {
          // Round to 4 decimals to avoid floating-point precision issues
          const rounded = roundTo4Decimals(taxNum);
          setTaxAmount(rounded.toString());
        } else {
          setTaxAmount("");
        }
      }
      
      // Handle miscellaneousCharges - convert to string for input field with proper rounding
      const miscValue = purchase.miscellaneousCharges;
      if (miscValue === null || miscValue === undefined) {
        setMiscellaneousCharges("");
      } else {
        const miscNum = typeof miscValue === "string" ? parseFloat(miscValue) : Number(miscValue);
        if (!isNaN(miscNum) && miscNum !== 0) {
          // Round to 4 decimals to avoid floating-point precision issues
          const rounded = roundTo4Decimals(miscNum);
          setMiscellaneousCharges(rounded.toString());
        } else {
          setMiscellaneousCharges("");
        }
      }
      setManualLines(
        purchase.lineItems.map((line) => ({
          id: crypto.randomUUID(),
          itemId: line.item.id,
          sku: line.item.sku ?? "",
          name: line.item.name ?? "",
          brandNumber: line.brandNumber ?? line.item.brandNumber ?? "",
          productType: line.productType ?? line.item.productType ?? "",
          sizeCode: line.sizeCode ?? line.item.sizeCode ?? "",
          packType: line.packType ?? line.item.packType ?? "",
          packSizeLabel: line.packSizeLabel ?? line.item.packSizeLabel ?? "",
          unitsPerPack:
            line.unitsPerCase !== null && line.unitsPerCase !== undefined
              ? String(line.unitsPerCase)
              : line.item.unitsPerPack !== null && line.item.unitsPerPack !== undefined
                ? String(line.item.unitsPerPack)
                : "",
          casesQuantity:
            line.casesQuantity !== null && line.casesQuantity !== undefined
              ? String(line.casesQuantity)
              : "",
          looseUnits: (() => {
            // Calculate looseUnits from existing data: quantityUnits - (casesQuantity * unitsPerCase)
            const qtyUnits = line.quantityUnits ?? 0;
            const casesQty = line.casesQuantity ?? 0;
            const unitsPerCase = line.unitsPerCase ?? line.item.unitsPerPack ?? 0;
            if (casesQty > 0 && unitsPerCase > 0) {
              const loose = qtyUnits - (casesQty * unitsPerCase);
              return loose > 0 ? String(loose) : "";
            }
            return "";
          })(),
          quantityUnits: String(line.quantityUnits ?? 0),
          mrpPrice:
            line.mrpPriceAtPurchase !== null && line.mrpPriceAtPurchase !== undefined
              ? String(line.mrpPriceAtPurchase)
              : line.item.mrpPrice !== null && line.item.mrpPrice !== undefined
                ? String(line.item.mrpPrice)
                : "",
          unitCostPrice:
            line.unitCostPrice !== null && line.unitCostPrice !== undefined
              ? String(line.unitCostPrice)
              : "",
          caseCostPrice:
            line.caseCostPrice !== null && line.caseCostPrice !== undefined
              ? String(line.caseCostPrice)
              : "",
          lineTotalPrice:
            line.lineTotalPrice !== null && line.lineTotalPrice !== undefined
              ? String(line.lineTotalPrice)
              : "",
        })),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeletePurchase = async (purchaseId: number) => {
    if (!window.confirm("⚠️ WARNING: Permanently delete this purchase?\n\nThis action cannot be undone. Stock levels will be adjusted, and this purchase record will be permanently removed from the database.")) {
      return;
    }
    setDeletingPurchaseId(purchaseId);
    try {
      await api.delete(`/purchases/${purchaseId}`);
      toast.success("Purchase deleted - items updated");
      if (editingPurchase?.id === purchaseId) {
        resetManualForm();
      }
      setExpandedPurchaseId((current) => (current === purchaseId ? null : current));
      setSelectedPurchaseIds((prev) => {
        const next = new Set(prev);
        next.delete(purchaseId);
        return next;
      });
      purchasesQuery.refetch();
      // Invalidate items queries since stock levels changed
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeletingPurchaseId(null);
    }
  };

  const handleBulkDeletePurchases = async () => {
    if (selectedPurchaseIds.size === 0) return;
    if (!window.confirm(`⚠️ WARNING: Permanently delete ${selectedPurchaseIds.size} purchase(s)?\n\nThis action cannot be undone. Stock levels will be adjusted, and these purchase records will be permanently removed from the database.`)) {
      return;
    }
    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedPurchaseIds).map((id) => api.delete(`/purchases/${id}`)));
      toast.success(`${selectedPurchaseIds.size} purchase(s) deleted - items updated`);
      if (editingPurchase && selectedPurchaseIds.has(editingPurchase.id)) {
        resetManualForm();
      }
      setExpandedPurchaseId((current) =>
        current && selectedPurchaseIds.has(current) ? null : current
      );
      setSelectedPurchaseIds(new Set());
      purchasesQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelectAllPurchases = () => {
    const purchases = purchasesQuery.data ?? [];
    if (selectedPurchaseIds.size === purchases.length) {
      setSelectedPurchaseIds(new Set());
    } else {
      setSelectedPurchaseIds(new Set(purchases.map((p) => p.id)));
    }
  };

  if (purchasesQuery.isLoading) {
    return <PageLoader message="Loading purchases..." />;
  }

  const toggleSelectPurchase = (id: number) => {
    setSelectedPurchaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Purchases / Stock In</p>
          <h1 className="text-2xl font-semibold text-slate-900">Upload or enter purchases</h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleManualSubmit} className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-slate-900">
                {editingPurchase ? "Edit purchase" : "Manual entry"}
              </p>
              {editingPurchase && (
                <button
                  type="button"
                  onClick={resetManualForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Cancel edit
                </button>
              )}
            </div>
            {editingPurchase && (
              <p className="mt-1 text-xs text-slate-500">
                Updating record from {parseDate(editingPurchase.purchaseDate).format("DD MMM YYYY")}
              </p>
            )}
            {!canEdit && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                You are in view-only mode. Admins can add or edit purchase records.
              </p>
            )}
          </div>
          <fieldset
            disabled={!canEdit}
            className={`${canEdit ? "" : "cursor-not-allowed opacity-60"} px-5 pb-5`}
          >
            <div className="mt-4 flex flex-col gap-4 lg:flex-row">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500">Purchase date</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500">Supplier (optional)</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Metro Liquor Suppliers"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-500">Internal notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Invoice reference, payment terms, etc."
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500">Tax Amount (₹)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && !isNaN(Number(val))) {
                      const rounded = roundTo4Decimals(Number(val));
                      setTaxAmount(rounded.toString());
                    }
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Miscellaneous Charges (₹)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={miscellaneousCharges}
                  onChange={(e) => setMiscellaneousCharges(e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && !isNaN(Number(val))) {
                      const rounded = roundTo4Decimals(Number(val));
                      setMiscellaneousCharges(rounded.toString());
                    }
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {manualLines.map((line, idx) => (
                <div key={line.id} className="space-y-3 rounded-2xl border border-slate-100 p-3">
                  {/* Row 1: Brand # / Size Code / Issue Type (Primary Key) */}
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Brand # *</label>
                      <input
                        type="text"
                        placeholder="e.g. 5016"
                        value={line.brandNumber}
                        onChange={(e) => handleManualChange(line.id, "brandNumber", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Size Code *</label>
                      <input
                        type="text"
                        placeholder="e.g. BE, DD, PP"
                        value={line.sizeCode}
                        onChange={(e) => handleManualChange(line.id, "sizeCode", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Issue Type *</label>
                      <input
                        type="text"
                        placeholder="e.g. S, P, G"
                        value={line.packType}
                        onChange={(e) => handleManualChange(line.id, "packType", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Product Type</label>
                      <input
                        type="text"
                        placeholder="e.g. Beer, IML"
                        value={line.productType}
                        onChange={(e) => handleManualChange(line.id, "productType", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                  </div>

                  {/* Row 2: Brand Name / Pack-Qty / Units per case */}
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Brand Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. KING FISHER PREMIUM"
                        value={line.name}
                        onChange={(e) => handleManualChange(line.id, "name", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Pack/Qty</label>
                      <input
                        type="text"
                        placeholder="e.g. 12 / 650ml"
                        value={line.packSizeLabel}
                        onChange={(e) => handleManualChange(line.id, "packSizeLabel", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">SKU (auto-generated)</label>
                      <input
                        type="text"
                        placeholder="Brand# + Size + Issue"
                        value={line.sku}
                        readOnly
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 bg-slate-50 text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Row 3: Units/case / Cases / Loose Units / Total units */}
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="text-xs text-slate-500">Units/case</label>
                      <input
                        type="number"
                        step="1"
                        min={0}
                        placeholder="e.g. 12"
                        value={line.unitsPerPack}
                        onChange={(e) => handleManualChange(line.id, "unitsPerPack", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Qty (Cases)</label>
                      <input
                        type="number"
                        step="1"
                        min={0}
                        placeholder="# cases"
                        value={line.casesQuantity}
                        onChange={(e) => handleManualChange(line.id, "casesQuantity", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Loose Units</label>
                      <input
                        type="number"
                        step="1"
                        min={0}
                        placeholder="e.g. 10 bottles"
                        value={line.looseUnits}
                        onChange={(e) => handleManualChange(line.id, "looseUnits", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Total units</label>
                      <input
                        type="number"
                        step="1"
                        min={0}
                        placeholder="Auto: (cases × units) + loose"
                        value={line.quantityUnits}
                        onChange={(e) => handleManualChange(line.id, "quantityUnits", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Row 4: Cost Prices */}
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Cost Price (per unit) *</label>
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        placeholder="Issue price per unit"
                        value={line.unitCostPrice}
                        onChange={(e) => handleManualChange(line.id, "unitCostPrice", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Cost Price (per case)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        placeholder="Optional: per case"
                        value={line.caseCostPrice}
                        onChange={(e) => handleManualChange(line.id, "caseCostPrice", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Total Price (line total)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        placeholder="Optional: line total"
                        value={line.lineTotalPrice}
                        onChange={(e) => handleManualChange(line.id, "lineTotalPrice", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">MRP (per unit, optional)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        placeholder="Uses existing if empty"
                        value={line.mrpPrice}
                        onChange={(e) => handleManualChange(line.id, "mrpPrice", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 bg-slate-50"
                      />
                    </div>
                  </div>

                  {manualLines.length > 1 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setManualLines((prev) => prev.filter((entry) => entry.id !== line.id))
                        }
                        className="text-xs font-semibold text-red-500 hover:underline"
                      >
                        Remove line {idx + 1}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <button
                type="button"
                onClick={() => setManualLines((prev) => [...prev, emptyLine()])}
                className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700"
              >
                + Add line
              </button>
              <span>Total quantity: {formatNumber(manualTotal)}</span>
            </div>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              className="mt-4 mb-5 w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:bg-brand-300"
            >
              {editingPurchase ? "Update purchase" : "Save purchase"}
            </LoadingButton>
          </fieldset>
        </form>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Import CSV / XLSX</p>
          <p className="text-sm text-slate-500">
            Required: Brand No, Brand Name, Product Type, Size Code, Pack/Qty, Issue Type, Issue Price
            <br />
            Required (at least one): Qty (Cases) OR Loose Units
            <br />
            Optional: Loose Units column (if you have both cases and loose bottles)
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Issue Price = cost per case • Optional: MRP column (if not provided, existing MRP is kept)
          </p>
          {!canEdit && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Only admins can upload purchase spreadsheets.
            </p>
          )}
          <fieldset
            disabled={!canEdit}
            className={`mt-4 space-y-3 ${canEdit ? "" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              onChange={handleImportChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">
              Need a template?{" "}
              <a
                href="/samples/purchase-template.csv"
                download
                className="font-semibold text-brand-600 hover:underline"
              >
                Download sample file
              </a>
            </p>
            {importFileName && (
              <p className="text-xs text-slate-500">Loaded: {importFileName}</p>
            )}
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex-1">
                <label className="text-xs text-slate-500">Purchase date</label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500">Supplier</label>
                <input
                  type="text"
                  value={importSupplier}
                  onChange={(e) => setImportSupplier(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500">Tax Amount (₹)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={importTaxAmount}
                  onChange={(e) => setImportTaxAmount(e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && !isNaN(Number(val))) {
                      const rounded = roundTo4Decimals(Number(val));
                      setImportTaxAmount(rounded.toString());
                    }
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Miscellaneous Charges (₹)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={importMiscellaneousCharges}
                  onChange={(e) => setImportMiscellaneousCharges(e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && !isNaN(Number(val))) {
                      const rounded = roundTo4Decimals(Number(val));
                      setImportMiscellaneousCharges(rounded.toString());
                    }
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
            </div>
            {importPreview && importPreview.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="flex flex-wrap gap-4">
                    <span>
                      Rows: <strong>{importPreview.length}</strong>
                    </span>
                    <span>
                      Cases: <strong>{formatNumber(importSummary.cases)}</strong>
                    </span>
                    <span>
                      Units: <strong>{formatNumber(importSummary.quantity)}</strong>
                    </span>
                    <span>
                      Value: <strong>{formatCurrency(importSummary.value)}</strong>
                    </span>
                  </p>
                  {importSummary.linesWithIssues > 0 && (
                    <p className="mt-2 font-semibold text-red-600">
                      ⚠️ {importSummary.linesWithIssues} rows have issues - fix them before importing
                    </p>
                  )}
                </div>
                {/* Show unique issues summary */}
                {importSummary.linesWithIssues > 0 && (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
                    <p className="font-semibold text-red-700">Issues found:</p>
                    <ul className="mt-2 space-y-1 text-sm text-red-600">
                      {Array.from(new Set(importPreview.flatMap(line => line.issues))).map((issue, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-red-400">•</span>
                          <span>{issue}</span>
                          <span className="text-red-400">
                            ({importPreview.filter(l => l.issues.includes(issue)).length} rows)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Brand / Name</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Pack</th>
                        <th className="px-3 py-2 text-right">Cases</th>
                        <th className="px-3 py-2 text-right">Loose</th>
                        <th className="px-3 py-2 text-right">Total Units</th>
                        <th className="px-3 py-2 text-right">Cost/case</th>
                        <th className="px-3 py-2 text-right">Line total</th>
                        <th className="px-3 py-2">Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {importPreview.map((line) => (
                        <tr 
                          key={`${line.row}-${line.payload.sku ?? line.rawName ?? line.row}`}
                          className={line.issues.length > 0 ? "bg-red-50" : ""}
                        >
                          <td className="px-3 py-2">{line.row}</td>
                          <td className="px-3 py-2">
                            <p className="font-mono text-xs text-brand-600">
                              {deriveSku(
                                line.payload.brandNumber ?? "",
                                line.payload.sizeCode ?? "",
                                line.payload.packType ?? ""
                              ) || "—"}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold uppercase text-slate-900">
                              #{line.payload.brandNumber ?? "—"}
                            </p>
                            <p className="text-[11px] text-slate-500">{line.rawName}</p>
                          </td>
                          <td className="px-3 py-2">{line.payload.sizeCode ?? "—"}</td>
                          <td className="px-3 py-2">
                            <p className="text-sm text-slate-600">{line.payload.packSizeLabel ?? "—"}</p>
                            <p className="text-[11px] uppercase text-slate-400">{line.payload.packType ?? "—"}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(line.payload.casesQuantity ?? 0)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(line.payload.looseUnits ?? 0)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(line.payload.quantityUnits ?? 0)}</td>
                          <td className="px-3 py-2 text-right">
                            {line.payload.caseCostPrice ? formatCurrency(line.payload.caseCostPrice) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {line.payload.lineTotalPrice ? formatCurrency(line.payload.lineTotalPrice) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {line.issues.length > 0 ? (
                              <div className="space-y-1">
                                {line.issues.map((issue, idx) => (
                                  <p key={idx} className="rounded bg-red-100 px-2 py-0.5 text-red-700">
                                    {issue}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <span className="text-emerald-600">✓ OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <LoadingButton
                  type="button"
                  onClick={handleImportSubmit}
                  loading={isImporting}
                  disabled={importSummary.linesWithIssues > 0}
                  className="w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                >
                  Confirm import
                </LoadingButton>
              </div>
            )}
          </fieldset>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickFilterCards.map((card) => {
          const isActive = activeFilter.kind === card.kind;
          return (
            <div
              key={card.kind}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                isActive ? "border-brand-200 shadow-md" : "border-slate-100"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{card.label}</p>
              <p className="mt-1 text-xs text-slate-500">{card.description}</p>
              <button
                type="button"
                onClick={() => handleQuickFilter(card.kind)}
                disabled={isActive}
                className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${
                  isActive
                    ? "bg-brand-200 text-brand-700"
                    : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                } disabled:cursor-not-allowed`}
              >
                {isActive ? "Active" : "View"}
              </button>
            </div>
          );
        })}
        <div
          className={`rounded-2xl border bg-white p-4 shadow-sm transition md:col-span-2 xl:col-span-2 ${
            activeFilter.kind === "CUSTOM" ? "border-brand-200 shadow-md" : "border-slate-100"
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Custom date range</p>
          <p className="mt-1 text-xs text-slate-500">Pick any range and view detailed purchases.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-medium text-slate-500">Start date</label>
              <input
                type="date"
                value={customRange.startDate}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500">End date</label>
              <input
                type="date"
                value={customRange.endDate}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCustomView}
            className="mt-3 w-full rounded-xl border border-brand-200 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            View range
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-slate-900">Recent purchases</p>
          <span className="flex-1 text-xs text-slate-500">Showing {activeFilterLabel}</span>
          {canEdit && selectedPurchaseIds.size > 0 && (
            <LoadingButton
              type="button"
              onClick={handleBulkDeletePurchases}
              loading={isBulkDeleting}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
            >
              Delete ({selectedPurchaseIds.size})
            </LoadingButton>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                {canEdit && (
                  <th className="w-10 py-2">
                    <input
                      type="checkbox"
                      checked={(purchasesQuery.data?.length ?? 0) > 0 && selectedPurchaseIds.size === (purchasesQuery.data?.length ?? 0)}
                      onChange={toggleSelectAllPurchases}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                )}
                <th className="py-2">Date</th>
                <th className="py-2">Supplier</th>
                <th className="py-2">Lines</th>
                <th className="py-2">Quantity</th>
                <th className="py-2">Amount</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(purchasesQuery.data ?? []).map((purchase) => {
                const totalQuantity =
                  purchase.lineItems?.reduce((sum, line) => sum + line.quantityUnits, 0) ?? 0;
                const itemsCost =
                  purchase.totalCost ??
                  purchase.lineItems?.reduce(
                    (sum, line) => sum + Number(line.unitCostPrice ?? 0) * line.quantityUnits,
                    0,
                  ) ??
                  0;
                const taxAmount = Number(purchase.taxAmount ?? 0);
                const miscellaneousCharges = Number(purchase.miscellaneousCharges ?? 0);
                const totalCost = itemsCost + taxAmount + miscellaneousCharges;
                return (
                  <Fragment key={purchase.id}>
                    <tr className={selectedPurchaseIds.has(purchase.id) ? "bg-brand-50" : ""}>
                      {canEdit && (
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={selectedPurchaseIds.has(purchase.id)}
                            onChange={() => toggleSelectPurchase(purchase.id)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                      )}
                      <td className="py-2 text-slate-900">
                        {parseDate(purchase.purchaseDate).format("DD MMM YYYY")}
                      </td>
                      <td className="py-2 text-slate-600">{purchase.supplierName ?? "—"}</td>
                      <td className="py-2 text-slate-600">{purchase.lineItems.length}</td>
                      <td className="py-2 font-semibold text-slate-900">
                        {formatNumber(totalQuantity)}
                      </td>
                      <td className="py-2 text-slate-900">{formatCurrency(totalCost)}</td>
                      <td className="py-2 text-right text-xs">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPurchaseId((current) =>
                                current === purchase.id ? null : purchase.id,
                              )
                            }
                            className="font-semibold text-brand-600 hover:underline"
                          >
                            {expandedPurchaseId === purchase.id ? "Hide" : "View"}
                          </button>
                          {canEdit ? (
                            <>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => handleEditPurchase(purchase.id)}
                                className="font-semibold text-slate-600 hover:underline"
                              >
                                Edit
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => handleDeletePurchase(purchase.id)}
                                disabled={deletingPurchaseId === purchase.id}
                                className="inline-flex items-center gap-1.5 font-semibold text-red-500 hover:underline disabled:text-red-300"
                              >
                                {deletingPurchaseId === purchase.id && <Spinner size="sm" />}
                                Delete
                              </button>
                            </>
                          ) : (
                            <span className="text-slate-400">View only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedPurchaseId === purchase.id && (
                      <tr>
                        <td colSpan={canEdit ? 7 : 6} className="bg-slate-50 px-4 py-3">
                          <div className="space-y-3 text-xs text-slate-600">
                            <div className="flex flex-wrap justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {purchase.supplierName ?? "Depot / supplier not set"}
                                </p>
                                {purchase.notes && <p className="mt-1">Notes: {purchase.notes}</p>}
                              </div>
                              <div className="text-right font-semibold text-slate-900">
                                <p>Total units: {formatNumber(totalQuantity)}</p>
                                <p>Items cost: {formatCurrency(itemsCost)}</p>
                                {Number(purchase.taxAmount ?? 0) > 0 && (
                                  <p className="text-sm text-slate-600">Tax: {formatCurrency(Number(purchase.taxAmount ?? 0))}</p>
                                )}
                                {Number(purchase.miscellaneousCharges ?? 0) > 0 && (
                                  <p className="text-sm text-slate-600">Misc: {formatCurrency(Number(purchase.miscellaneousCharges ?? 0))}</p>
                                )}
                                <p className="text-lg">Total cost: {formatCurrency(totalCost)}</p>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead className="text-left uppercase text-slate-400">
                                  <tr>
                                    <th className="py-1">Brand No / Name</th>
                                    <th className="py-1">Type</th>
                                    <th className="py-1">Size</th>
                                    <th className="py-1">Pack/Qty</th>
                                    <th className="py-1">Issue</th>
                                    <th className="py-1 text-right">Cases</th>
                                    <th className="py-1 text-right">Loose</th>
                                    <th className="py-1 text-right">Total Units</th>
                                    <th className="py-1 text-right">Issue Price</th>
                                    <th className="py-1 text-right">Line total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {purchase.lineItems.map((line) => {
                                    const unitCost = Number(line.unitCostPrice ?? 0);
                                    const lineTotalCost =
                                      line.lineTotalPrice !== null && line.lineTotalPrice !== undefined
                                        ? Number(line.lineTotalPrice)
                                        : unitCost * line.quantityUnits;
                                    // Calculate looseUnits if not stored: quantityUnits - (casesQuantity * unitsPerCase)
                                    const casesQty = line.casesQuantity ?? 0;
                                    const unitsPerCase = line.unitsPerCase ?? line.item.unitsPerPack ?? 0;
                                    const looseUnits = line.looseUnits ?? 
                                      (casesQty > 0 && unitsPerCase > 0 
                                        ? Math.max(0, line.quantityUnits - (casesQty * unitsPerCase))
                                        : 0);
                                    return (
                                      <tr key={line.id}>
                                        <td className="py-1">
                                          <p className="font-semibold text-slate-900">
                                            #{line.brandNumber ?? line.item.brandNumber ?? "—"}
                                          </p>
                                          <p className="text-slate-600">{line.item.name}</p>
                                        </td>
                                        <td className="py-1 text-slate-500">
                                          {line.productType ?? line.item.productType ?? "—"}
                                        </td>
                                        <td className="py-1 text-slate-500">
                                          {line.sizeCode ?? line.item.sizeCode ?? "—"}
                                        </td>
                                        <td className="py-1 text-slate-600">
                                          {line.packSizeLabel ?? line.item.packSizeLabel ?? "—"}
                                        </td>
                                        <td className="py-1 text-slate-500">
                                          {line.packType ?? "—"}
                                        </td>
                                        <td className="py-1 text-right">
                                          {formatNumber(casesQty)}
                                        </td>
                                        <td className="py-1 text-right">
                                          {looseUnits > 0 ? formatNumber(looseUnits) : "—"}
                                        </td>
                                        <td className="py-1 text-right">{formatNumber(line.quantityUnits)}</td>
                                        <td className="py-1 text-right">{formatCurrency(unitCost)}</td>
                                        <td className="py-1 text-right font-semibold text-slate-900">
                                          {formatCurrency(lineTotalCost)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {(purchasesQuery.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="py-6 text-center text-slate-500">
                    No purchases recorded for this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
