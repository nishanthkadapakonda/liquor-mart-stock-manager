import { Fragment, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import Select from "react-select";
import { api, getErrorMessage } from "../api/client";
import type {
  AppSettings,
  DayEndLineInput,
  DayEndPreview,
  DayEndReport,
  Item,
  SalesChannel,
} from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { useAuth } from "../providers/AuthProvider";
import { parseDayEndUpload, type ParsedLine } from "../utils/fileParsers";

interface ItemOption {
  value: number;
  label: string;
  item: Item;
}

interface DayEndLineForm extends Omit<DayEndLineInput, "quantitySoldUnits"> {
  id: string;
  quantitySoldUnits: string;
  sellingPricePerUnit?: number;
  beltMarkup: number; // per-line belt markup, only used when channel is BELT
}

const channelLabels: Record<SalesChannel, string> = {
  RETAIL: "Retail (MRP)",
  BELT: "Belt (MRP + markup)",
};

const FALLBACK_BELT_MARKUP = 20; // Used only if settings not loaded yet

function createEmptyLine(defaultMarkup: number = FALLBACK_BELT_MARKUP): DayEndLineForm {
  return {
    id: crypto.randomUUID(),
    itemId: undefined,
    sku: "",
    channel: "RETAIL",
    quantitySoldUnits: "",
    sellingPricePerUnit: undefined,
    beltMarkup: defaultMarkup,
  };
}

export function DayEndPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const [reportDate, setReportDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [beltMarkup, setBeltMarkup] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DayEndLineForm[]>([createEmptyLine()]);
  const [preview, setPreview] = useState<DayEndPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [editingReport, setEditingReport] = useState<DayEndReport | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  const [deleteInFlight, setDeleteInFlight] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState<ParsedLine<DayEndLineInput>[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [includeTaxMisc, setIncludeTaxMisc] = useState(false); // Toggle for cost/profit with tax/misc

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await api.get<{ settings: AppSettings | null }>("/settings");
      return response.data.settings ?? null;
    },
  });

  // Default belt markup from global settings
  const defaultBeltMarkup = useMemo(() => {
    return Number(settingsQuery.data?.defaultBeltMarkupRupees ?? FALLBACK_BELT_MARKUP);
  }, [settingsQuery.data?.defaultBeltMarkupRupees]);

  // Set report-level belt markup from settings when available
  useEffect(() => {
    if (!beltMarkup && settingsQuery.data?.defaultBeltMarkupRupees) {
      setBeltMarkup(String(settingsQuery.data.defaultBeltMarkupRupees));
    }
  }, [beltMarkup, settingsQuery.data?.defaultBeltMarkupRupees]);

  // Update existing lines with correct belt markup when settings load
  useEffect(() => {
    if (settingsQuery.data?.defaultBeltMarkupRupees && !editingReport) {
      const settingsMarkup = Number(settingsQuery.data.defaultBeltMarkupRupees);
      setLines((prev) =>
        prev.map((line) =>
          line.beltMarkup === FALLBACK_BELT_MARKUP ? { ...line, beltMarkup: settingsMarkup } : line
        )
      );
    }
  }, [settingsQuery.data?.defaultBeltMarkupRupees, editingReport]);

  const itemsQuery = useQuery({
    queryKey: ["items", "for-day-end"],
    queryFn: async () => {
      const response = await api.get<{ items: Item[] }>("/items");
      return response.data.items.filter((item) => item.isActive !== false);
    },
  });

  const reportsQuery = useQuery({
    queryKey: ["day-end-reports"],
    queryFn: async () => {
      const endDate = dayjs().format("YYYY-MM-DD");
      const startDate = dayjs().subtract(30, "day").format("YYYY-MM-DD");
      const response = await api.get<{ reports: DayEndReport[] }>("/day-end-reports", {
        params: { startDate, endDate },
      });
      return response.data.reports;
    },
  });

  const sortedItems = useMemo(() => {
    const source = itemsQuery.data ?? [];
    return [...source].sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsQuery.data]);

  const itemOptions: ItemOption[] = useMemo(() => {
    return sortedItems.map((item) => {
      // Build a descriptive label with brand number, name, size/qty, and stock
      const sizeInfo = item.packSizeLabel || `${item.sizeCode || ""}${item.packType ? ` ${item.packType}` : ""}`;
      return {
        value: item.id,
        label: `#${item.brandNumber} ${item.name} - ${sizeInfo} (${item.currentStockUnits} in stock)`,
        item,
      };
    });
  }, [sortedItems]);
  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    for (const item of itemsQuery.data ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [itemsQuery.data]);
  const itemsBySku = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of itemsQuery.data ?? []) {
      if (item.sku) {
        map.set(item.sku.toLowerCase(), item);
      }
    }
    return map;
  }, [itemsQuery.data]);

  const plannedTotalUnits = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const quantity = Number(line.quantitySoldUnits || 0);
        return sum + (Number.isFinite(quantity) ? quantity : 0);
      }, 0),
    [lines],
  );

  const plannedLinesCount = useMemo(
    () => lines.filter((line) => line.itemId || line.sku).length,
    [lines],
  );

  const isEditingExisting = Boolean(editingReport);

  const importSummary = useMemo(() => {
    if (!importPreview.length) {
      return { rows: 0, units: 0, issues: 0 };
    }
    const units = importPreview.reduce((sum, row) => sum + (row.payload.quantitySoldUnits ?? 0), 0);
    const issues = importPreview.filter((row) => row.issues.length > 0).length;
    return { rows: importPreview.length, units, issues };
  }, [importPreview]);

  const resetForm = () => {
    setReportDate(dayjs().format("YYYY-MM-DD"));
    setNotes("");
    setLines([createEmptyLine()]);
    setPreview(null);
    setEditingReport(null);
    setImportPreview([]);
    setImportFileName(null);
  };

  const updateLine = (id: string, updater: (line: DayEndLineForm) => DayEndLineForm) => {
    setLines((prev) => prev.map((line) => (line.id === id ? updater(line) : line)));
  };

  const handleSelectItem = (lineId: string, value: string) => {
    if (!value) {
      updateLine(lineId, (line) => ({ ...line, itemId: undefined, sellingPricePerUnit: undefined }));
      return;
    }
    const item = itemsById.get(Number(value));
    updateLine(lineId, (line) => ({
      ...line,
      itemId: item?.id,
      sku: item?.sku ?? line.sku,
      // Always update price when item changes, using line's belt markup
      sellingPricePerUnit: item ? suggestPrice(item, line.channel, line.beltMarkup) : undefined,
    }));
  };

  const suggestPrice = (item: Item, channel: SalesChannel, beltMarkupValue: number) => {
    const mrp = Number(item.mrpPrice ?? 0);
    return channel === "RETAIL" ? mrp : mrp + beltMarkupValue;
  };

  const buildPayload = (): (DayEndLineInput & { sellingPricePerUnit?: number })[] | null => {
    const prepared = lines
      .filter((line) => line.itemId || line.sku)
      .map((line) => ({
        itemId: line.itemId,
        sku: line.sku || undefined,
        channel: line.channel,
        quantitySoldUnits: Number(line.quantitySoldUnits || 0),
        sellingPricePerUnit: line.sellingPricePerUnit,
      }));

    if (prepared.length === 0) {
      toast.error("Add at least one sales line");
      return null;
    }

    if (prepared.some((line) => !line.quantitySoldUnits || line.quantitySoldUnits <= 0)) {
      toast.error("Each line needs a quantity greater than 0");
      return null;
    }

    return prepared;
  };

  const applyImportedLines = () => {
    if (!importPreview.length) {
      return;
    }
    let unmatchedCount = 0;
    const nextLines = importPreview.map((row) => {
      const skuKey = row.payload.sku?.toLowerCase() ?? "";
      const matched = skuKey ? itemsBySku.get(skuKey) : undefined;
      
      if (!matched && skuKey) {
        unmatchedCount++;
      }
      
      return {
        id: crypto.randomUUID(),
        itemId: matched?.id,
        sku: row.payload.sku ?? matched?.sku ?? "",
        channel: row.payload.channel,
        quantitySoldUnits: String(row.payload.quantitySoldUnits ?? 0),
        sellingPricePerUnit:
          row.payload.sellingPricePerUnit ??
          (matched ? suggestPrice(matched, row.payload.channel, defaultBeltMarkup) : undefined),
        beltMarkup: defaultBeltMarkup,
      };
    });
    if (nextLines.length) {
      setLines(nextLines);
      if (unmatchedCount > 0) {
        toast.error(
          `${unmatchedCount} item(s) could not be matched by SKU. Please select them manually from the dropdown.`
        );
      } else {
        toast.success("All items matched successfully!");
      }
    }
    setImportPreview([]);
    setImportFileName(null);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseDayEndUpload(file);
      setImportPreview(parsed);
      setImportFileName(file.name);
      toast.success(`Loaded ${parsed.length} rows`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const clearImportPreview = () => {
    setImportPreview([]);
    setImportFileName(null);
  };

  const handleEditReport = async (reportId: number) => {
    setLoadingReportId(reportId);
    try {
      const response = await api.get<{ report: DayEndReport }>(`/day-end-reports/${reportId}`);
      const report = response.data.report;
      setEditingReport(report);
      setReportDate(dayjs(report.reportDate).format("YYYY-MM-DD"));
      setBeltMarkup(
        report.beltMarkupRupees !== null && report.beltMarkupRupees !== undefined
          ? String(report.beltMarkupRupees)
          : "",
      );
      setNotes(report.notes ?? "");
      setLines(
        report.lines.map((line) => ({
          id: crypto.randomUUID(),
          itemId: line.item.id,
          sku: line.item.sku ?? "",
          channel: line.channel,
          quantitySoldUnits: String(line.quantitySoldUnits ?? 0),
          sellingPricePerUnit:
            line.sellingPricePerUnit !== null && line.sellingPricePerUnit !== undefined
              ? Number(line.sellingPricePerUnit)
              : undefined,
          beltMarkup: Number(report.beltMarkupRupees ?? defaultBeltMarkup),
        })),
      );
      // Refresh items to get latest stock (note: stock will restore on save)
      await itemsQuery.refetch();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!window.confirm("⚠️ WARNING: Permanently delete this day-end report?\n\nThis action cannot be undone. Stock balances will be restored, and this report will be permanently removed from the database.")) {
      return;
    }
    setDeleteInFlight(reportId);
    try {
      await api.delete(`/day-end-reports/${reportId}`);
      toast.success("Report deleted");
      if (editingReport?.id === reportId) {
        resetForm();
      }
      setExpandedReportId((current) => (current === reportId ? null : current));
      // Refresh both reports and items to show restored stock
      reportsQuery.refetch();
      itemsQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeleteInFlight(null);
    }
  };

  const handlePreview = async () => {
    if (!canEdit) {
      toast.error("View-only users cannot preview new reports");
      return;
    }
    const payloadLines = buildPayload();
    if (!payloadLines) return;
    setIsPreviewLoading(true);
    try {
      const response = await api.post<DayEndPreview>("/day-end-reports/preview", {
        reportDate,
        beltMarkupRupees: beltMarkup ? Number(beltMarkup) : undefined,
        notes: notes || undefined,
        lines: payloadLines,
        // Pass editing report ID so backend can account for stock being restored
        ...(editingReport ? { editingReportId: editingReport.id } : {}),
      });
      setPreview(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!canEdit) {
      toast.error("View-only users cannot save reports");
      return;
    }
    const payloadLines = buildPayload();
    if (!payloadLines) return;
    setIsSaving(true);
    try {
      const payload = {
        reportDate,
        beltMarkupRupees: beltMarkup ? Number(beltMarkup) : undefined,
        notes: notes || undefined,
        lines: payloadLines,
      };
      if (editingReport) {
        await api.put(`/day-end-reports/${editingReport.id}`, payload);
        toast.success("Day-end report updated");
      } else {
        await api.post("/day-end-reports", payload);
        toast.success("Day-end report saved");
      }
      resetForm();
      // Refresh both reports and items to show updated stock
      reportsQuery.refetch();
      itemsQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.id !== id)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine(defaultBeltMarkup)]);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Sales closing</p>
          <h1 className="text-2xl font-semibold text-slate-900">Day-end sales & belt slips</h1>
          <p className="mt-1 text-sm text-slate-500">
            Capture retail + belt movements, preview totals, and lock the report to adjust stock.
          </p>
        </div>
      </div>

      {/* Main Content: Entry Form (left) + Preview/Import (right) */}
      <div className="grid gap-6 lg:grid-cols-[1.8fr,1fr]">
        {/* Entry Form */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {!canEdit && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              You have read-only access. Ask an admin to capture or edit day-end reports.
            </p>
          )}
          {isEditingExisting && editingReport && (
            <div className="mb-4 space-y-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>Editing report for {dayjs(editingReport.reportDate).format("DD MMM YYYY")}</p>
                <button type="button" onClick={resetForm} className="text-xs font-semibold text-brand-700 hover:underline">
                  Cancel edit
                </button>
              </div>
              <p className="text-xs text-brand-600">
                Note: Stock shown may appear low because the original sale already deducted units. When you save, the original quantities will be restored first.
              </p>
            </div>
          )}
          <fieldset disabled={!canEdit} className={canEdit ? "" : "opacity-60"}>
            {/* Date and Notes Row */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500">Report date</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Driver list, promo, etc."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            {/* Sales Lines */}
            <div className="mt-6 space-y-4">
              {lines.map((line, idx) => {
                const linkedItem = line.itemId ? itemsById.get(line.itemId) : undefined;
                return (
                  <div key={line.id} className="space-y-3 rounded-2xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <p>Line {idx + 1}</p>
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(line.id)} className="font-semibold text-red-500">
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-12">
                      <div className="lg:col-span-5">
                        <label className="text-xs font-medium text-slate-500">Select item</label>
                        <Select<ItemOption>
                          value={itemOptions.find((opt) => opt.value === line.itemId) || null}
                          onChange={(selected) => handleSelectItem(line.id, selected ? String(selected.value) : "")}
                          options={itemOptions}
                          isClearable
                          isSearchable
                          placeholder="Search by name, brand number..."
                          classNames={{
                            control: () => "!rounded-xl !border-slate-200 !min-h-[42px] !text-sm",
                            menu: () => "!rounded-xl !text-sm !z-50",
                            option: () => "!text-sm",
                            singleValue: () => "!text-sm",
                          }}
                          styles={{
                            control: (base, state) => ({
                              ...base,
                              borderColor: state.isFocused ? "#8b5cf6" : "#e2e8f0",
                              boxShadow: state.isFocused ? "0 0 0 2px rgba(139, 92, 246, 0.1)" : "none",
                              "&:hover": { borderColor: "#8b5cf6" },
                            }),
                            menu: (base) => ({
                              ...base,
                              minWidth: "400px",
                            }),
                            menuList: (base) => ({
                              ...base,
                              maxHeight: "300px",
                            }),
                          }}
                          noOptionsMessage={() => "No items found"}
                        />
                        {linkedItem && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Stock {formatNumber(linkedItem.currentStockUnits)} · MRP {formatCurrency(linkedItem.mrpPrice)} · SKU: {linkedItem.sku}
                          </p>
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        <label className="text-xs font-medium text-slate-500">Channel</label>
                        <select
                          value={line.channel}
                          onChange={(e) =>
                            updateLine(line.id, (current) => {
                              const nextChannel = e.target.value as SalesChannel;
                              const item = current.itemId ? itemsById.get(current.itemId) : undefined;
                              return {
                                ...current,
                                channel: nextChannel,
                                // Always recalculate price when channel changes, using line's belt markup
                                sellingPricePerUnit: item ? suggestPrice(item, nextChannel, current.beltMarkup) : undefined,
                              };
                            })
                          }
                          className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                            line.channel === "BELT" ? "border-amber-300 bg-amber-50" : "border-slate-200"
                          }`}
                        >
                          {Object.entries(channelLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        {/* Belt Markup input - only visible when Belt channel is selected */}
                        {line.channel === "BELT" && (
                          <div className="mt-2">
                            <label className="text-[10px] font-medium text-amber-700">Belt Markup (₹)</label>
                            <input
                              type="number"
                              min={0}
                              value={line.beltMarkup}
                              onChange={(e) => {
                                const newMarkup = Number(e.target.value) || 0;
                                updateLine(line.id, (current) => {
                                  const item = current.itemId ? itemsById.get(current.itemId) : undefined;
                                  return {
                                    ...current,
                                    beltMarkup: newMarkup,
                                    // Recalculate price with new markup
                                    sellingPricePerUnit: item ? suggestPrice(item, "BELT", newMarkup) : current.sellingPricePerUnit,
                                  };
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        <label className="text-xs font-medium text-slate-500">Quantity sold</label>
                        <input
                          type="number"
                          min={0}
                          value={line.quantitySoldUnits}
                          onChange={(e) =>
                            updateLine(line.id, (current) => ({ ...current, quantitySoldUnits: e.target.value }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                          required
                        />
                      </div>
                      <div className="lg:col-span-3">
                        <label className="text-xs font-medium text-slate-500">Selling price</label>
                        <input
                          type="number"
                          min={0}
                          value={line.sellingPricePerUnit ?? ""}
                          placeholder={linkedItem ? String(suggestPrice(linkedItem, line.channel, line.beltMarkup)) : "Auto"}
                          onChange={(e) =>
                            updateLine(line.id, (current) => ({
                              ...current,
                              sellingPricePerUnit: e.target.value ? Number(e.target.value) : undefined,
                            }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <p className="mt-1 text-[11px] text-slate-400">Leave empty to auto-calc</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <button
                type="button"
                onClick={addLine}
                className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700"
              >
                + Add sales line
              </button>
              <span>{plannedLinesCount} lines</span>
              <span>Planned units: {formatNumber(plannedTotalUnits)}</span>
            </div>

            <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row">
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewLoading}
                className="rounded-xl border border-brand-200 px-4 py-2 font-semibold text-brand-600 transition hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPreviewLoading ? "Generating preview…" : "Preview totals"}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving}
                className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {isSaving ? "Saving report…" : isEditingExisting ? "Update report" : "Save day-end report"}
              </button>
            </div>
          </fieldset>
        </div>

        {/* Right Panel: Preview + Import + Tips */}
        <div className="space-y-6">
          {/* Preview Panel */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-900">Preview totals</p>
            {!preview && (
              <p className="mt-2 text-sm text-slate-500">
                Generate a preview to see revenue split, belt markup applied & any shortages before posting.
              </p>
            )}
            {preview && (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-slate-500">Total revenue</p>
                  <p className="text-lg font-semibold text-slate-900">{formatCurrency(preview.totalRevenue)}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase text-slate-400">Retail</p>
                    <p className="text-lg font-semibold text-slate-900">{formatCurrency(preview.retailRevenue)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase text-slate-400">Belt</p>
                    <p className="text-lg font-semibold text-slate-900">{formatCurrency(preview.beltRevenue)}</p>
                  </div>
                </div>
                {/* Profit Section */}
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-emerald-700">Estimated Profit</p>
                        <button
                          type="button"
                          onClick={() => setIncludeTaxMisc(!includeTaxMisc)}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                            includeTaxMisc
                              ? "bg-emerald-200 text-emerald-800"
                              : "bg-white text-emerald-600"
                          }`}
                          title="Toggle to show profit with/without purchase tax & misc charges"
                        >
                          {includeTaxMisc ? "Net" : "Gross"}
                        </button>
                      </div>
                      <p className="text-lg font-bold text-emerald-700">
                        {formatCurrency(preview.totalProfit)}
                      </p>
                      {includeTaxMisc && (
                        <p className="mt-1 text-[10px] text-emerald-500">
                          Note: Net profit calculated on save
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-emerald-600">
                    <p>Cost: {formatCurrency(preview.totalCost)}</p>
                    <p>Margin: {preview.profitMargin.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <p className="text-slate-500">Revenue</p>
                  <p className="text-lg font-semibold text-slate-900">{formatCurrency(preview.totalRevenue)}</p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <p className="text-slate-500">Units sold</p>
                  <p className="text-lg font-semibold text-slate-900">{formatNumber(preview.totalUnits)}</p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <p className="text-slate-500">Default belt markup</p>
                  <p className="text-lg font-semibold text-slate-900">₹{defaultBeltMarkup}</p>
                </div>
              </div>
            )}
            {preview?.shortages.length ? (
              <div className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                <p className="font-semibold">Items with insufficient stock:</p>
                {preview.shortages.map((shortage) => (
                  <p key={shortage.itemId}>
                    {shortage.itemName}: need {shortage.required}, available {shortage.available}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          {/* Import from Excel */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-900">Import from Excel / CSV</p>
            <p className="text-sm text-slate-500">
              Upload day-end sales exported from POS. Required columns: <strong>sku</strong> (or <strong>brand_number + size_code + pack_type</strong>), <strong>channel</strong> (RETAIL/BELT), <strong>quantity_sold_units</strong>. Optional: <strong>selling_price_per_unit</strong>.
            </p>
            {!canEdit && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                View-only users cannot import sales lines.
              </p>
            )}
            <fieldset disabled={!canEdit} className={`mt-4 space-y-3 ${canEdit ? "" : "opacity-60"}`}>
              <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleImportFile}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">
                Need a template?{" "}
                <a href="/samples/day-end-template.csv" download className="font-semibold text-brand-600 hover:underline">
                  Download sample file
                </a>
              </p>
              {importFileName && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Loaded: {importFileName}</span>
                  <button type="button" onClick={clearImportPreview} className="font-semibold text-brand-600">Clear</button>
                </div>
              )}
              {importPreview.length > 0 && (
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p>
                      Rows: <strong>{importSummary.rows}</strong> · Units: <strong>{formatNumber(importSummary.units)}</strong>
                    </p>
                    {importSummary.issues > 0 && (
                      <p className="text-xs text-red-500">{importSummary.issues} rows have issues.</p>
                    )}
                  </div>
                  <div className="max-h-48 overflow-auto rounded-xl border border-slate-100 text-xs">
                    <table className="min-w-full text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">SKU / Channel</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Issues</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.slice(0, 12).map((line) => (
                          <tr key={`${line.row}-${line.payload.sku ?? line.rawName}`}>
                            <td className="px-3 py-1">{line.row}</td>
                            <td className="px-3 py-1">
                              <p className="font-semibold text-slate-900">{line.payload.sku ?? "—"}</p>
                              <p className="text-[11px] text-slate-500">{line.payload.channel}</p>
                            </td>
                            <td className="px-3 py-1">{line.payload.quantitySoldUnits}</td>
                            <td className="px-3 py-1 text-red-500">{line.issues.length ? line.issues.join(", ") : "OK"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.length > 12 && (
                      <p className="px-3 py-2 text-[11px] text-slate-500">Showing first 12 rows of {importPreview.length}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={applyImportedLines}
                    disabled={importSummary.issues > 0}
                    className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
                  >
                    Use lines in form
                  </button>
                </div>
              )}
            </fieldset>
          </div>

          {/* Tips */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-900">Tips</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-500">
              <li>Lines without a selling price inherit channel defaults.</li>
              <li>Retail = MRP price.</li>
              <li>Belt = MRP + markup (default ₹{defaultBeltMarkup}, editable per line).</li>
              <li>Saving the report will decrease stock for all linked items.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Recent Reports - At Bottom */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">Recent day-end reports</p>
              <p className="text-xs text-slate-500">Last 30 days</p>
            </div>
            <button type="button" onClick={() => reportsQuery.refetch()} className="text-xs font-semibold text-brand-600">
              Refresh
            </button>
          </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Date</th>
                <th className="py-2">Units</th>
                <th className="py-2">Revenue</th>
                <th className="py-2">Profit</th>
                <th className="py-2">Lines</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(reportsQuery.data ?? []).map((report) => (
                <Fragment key={report.id}>
                  <tr>
                    <td className="py-3 text-slate-900">{dayjs(report.reportDate).format("DD MMM YYYY")}</td>
                    <td className="py-3 text-slate-600">{formatNumber(report.totalUnitsSold ?? 0)}</td>
                    <td className="py-3 text-slate-900">{formatCurrency(report.totalSalesAmount ?? 0)}</td>
                    <td className="py-3">
                      {report.totalProfit !== null && report.totalProfit !== undefined ? (
                        <span className="font-semibold text-emerald-600">
                          {formatCurrency(Number(report.totalProfit))}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-slate-600">{report.lines.length}</td>
                    <td className="py-3 text-right text-xs">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedReportId((current) => (current === report.id ? null : report.id))}
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          {expandedReportId === report.id ? "Hide" : "View"}
                        </button>
                        {canEdit && (
                          <>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => handleEditReport(report.id)}
                              disabled={loadingReportId === report.id}
                              className="font-semibold text-slate-600 hover:underline disabled:text-slate-400"
                            >
                              {loadingReportId === report.id ? "Loading…" : "Edit"}
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteReport(report.id)}
                              disabled={deleteInFlight === report.id}
                              className="font-semibold text-red-500 hover:underline disabled:text-red-300"
                            >
                              {deleteInFlight === report.id ? "Deleting…" : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedReportId === report.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-4 py-3">
                        <div className="space-y-2 text-xs text-slate-600">
                          {report.notes && <p>Notes: {report.notes}</p>}
                          <div className="flex flex-wrap gap-4">
                            <p>Belt markup: {formatCurrency(report.beltMarkupRupees ?? 0)}</p>
                            {report.totalCost && <p>Total Cost: {formatCurrency(report.totalCost)}</p>}
                            {report.totalProfit !== null && report.totalProfit !== undefined && (
                              <p className="font-semibold text-emerald-600">
                                Total Profit: {formatCurrency(Number(report.totalProfit))}
                              </p>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-[11px]">
                              <thead className="text-left uppercase text-slate-400">
                                <tr>
                                  <th className="py-1">Item</th>
                                  <th className="py-1">Channel</th>
                                  <th className="py-1">Qty</th>
                                  <th className="py-1">Revenue</th>
                                  <th className="py-1">Cost</th>
                                  <th className="py-1">Profit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {report.lines.map((line) => {
                                  const sizeInfo = line.item.packSizeLabel || `${line.item.sizeCode || ""}${line.item.packType ? ` ${line.item.packType}` : ""}`.trim();
                                  return (
                                    <tr key={line.id}>
                                      <td className="py-1">
                                        <p className="font-semibold text-slate-900">{line.item.name}</p>
                                        <p className="text-[10px] text-slate-500">
                                          SKU: {line.item.sku}
                                          {sizeInfo && ` • ${sizeInfo}`}
                                        </p>
                                      </td>
                                      <td className="py-1">{line.channel}</td>
                                      <td className="py-1">{formatNumber(line.quantitySoldUnits)}</td>
                                      <td className="py-1">{formatCurrency(line.lineRevenue)}</td>
                                      <td className="py-1 text-slate-500">{line.lineCost ? formatCurrency(line.lineCost) : "—"}</td>
                                      <td className="py-1 font-semibold text-emerald-600">
                                        {line.lineProfit ? formatCurrency(line.lineProfit) : "—"}
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
              ))}
              {(reportsQuery.data?.length ?? 0) === 0 && !reportsQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">No reports for this period yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
