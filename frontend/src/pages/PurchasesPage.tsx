import { ChangeEvent, FormEvent, Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../api/client";
import type { Purchase } from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { parsePurchaseUpload, type ParsedLine } from "../utils/fileParsers";
import { useAuth } from "../providers/AuthProvider";

interface ManualLine {
  id: string;
  itemId?: number;
  sku: string;
  name: string;
  quantityUnits: string;
  mrpPrice: string;
  unitCostPrice: string;
}

function emptyLine(): ManualLine {
  return {
    id: crypto.randomUUID(),
    itemId: undefined,
    sku: "",
    name: "",
    quantityUnits: "",
    mrpPrice: "",
    unitCostPrice: "",
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

export function PurchasesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const [purchaseDate, setPurchaseDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [manualLines, setManualLines] = useState<ManualLine[]>([emptyLine()]);
  const [importPreview, setImportPreview] =
    useState<ParsedLine<{ quantityUnits: number }>[]>(); // loose typing for preview table
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importDate, setImportDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [importSupplier, setImportSupplier] = useState("");
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [activeFilter, setActiveFilter] = useState<PurchaseFilter>(() => {
    const range = buildDateRange(30);
    return { kind: "LAST_30", ...range };
  });
  const [customRange, setCustomRange] = useState(() => buildDateRange(30));
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<number | null>(null);

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
    setPurchaseDate(dayjs().format("YYYY-MM-DD"));
    setEditingPurchase(null);
  };

  const handleManualChange = (id: string, key: keyof ManualLine, value: string) => {
    setManualLines((prev) =>
      prev.map((line) =>
        line.id === id
          ? {
              ...line,
              [key]: value,
              ...(key === "sku" || key === "name" ? { itemId: undefined } : {}),
            }
          : line,
      ),
    );
  };

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payloadLines = manualLines
      .filter((line) => line.sku || line.name)
      .map((line) => ({
        itemId: line.itemId,
        sku: line.sku || undefined,
        name: line.name || undefined,
        quantityUnits: Number(line.quantityUnits || 0),
        mrpPrice: Number(line.mrpPrice || 0),
        unitCostPrice: Number(line.unitCostPrice || line.mrpPrice || 0),
      }));

    if (payloadLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    try {
      if (editingPurchase) {
        await api.put(`/purchases/${editingPurchase.id}`, {
          purchaseDate,
          supplierName: supplierName || undefined,
          notes: notes || undefined,
          lineItems: payloadLines,
          allowItemCreation: true,
        });
        toast.success("Purchase updated");
      } else {
        await api.post("/purchases", {
          purchaseDate,
          supplierName: supplierName || undefined,
          notes: notes || undefined,
          lineItems: payloadLines,
          allowItemCreation: true,
        });
        toast.success("Purchase saved");
      }
      resetManualForm();
      purchasesQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
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
    if (!importPreview) return { quantity: 0, linesWithIssues: 0 };
    const quantity = importPreview.reduce(
      (sum, row) => sum + (row.payload.quantityUnits ?? 0),
      0,
    );
    const linesWithIssues = importPreview.filter((row) => row.issues.length > 0).length;
    return { quantity, linesWithIssues };
  }, [importPreview]);

  const handleImportSubmit = async () => {
    if (!importPreview || importPreview.length === 0) return;
    try {
      await api.post("/purchases/import", {
        purchaseDate: importDate,
        supplierName: importSupplier,
        lineItems: importPreview.map((line) => line.payload),
        allowItemCreation: true,
      });
      toast.success("Import completed");
      setImportPreview(undefined);
      setImportFileName(null);
      setImportSupplier("");
      purchasesQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleEditPurchase = async (purchaseId: number) => {
    try {
      const response = await api.get<{ purchase: Purchase }>(`/purchases/${purchaseId}`);
      const purchase = response.data.purchase;
      setEditingPurchase(purchase);
      setPurchaseDate(dayjs(purchase.purchaseDate).format("YYYY-MM-DD"));
      setSupplierName(purchase.supplierName ?? "");
      setNotes(purchase.notes ?? "");
      setManualLines(
        purchase.lineItems.map((line) => ({
          id: crypto.randomUUID(),
          itemId: line.item.id,
          sku: line.item.sku ?? "",
          name: line.item.name ?? "",
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
        })),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeletePurchase = async (purchaseId: number) => {
    if (!window.confirm("Delete this purchase? Stock levels will be adjusted.")) {
      return;
    }
    try {
      await api.delete(`/purchases/${purchaseId}`);
      toast.success("Purchase deleted");
      if (editingPurchase?.id === purchaseId) {
        resetManualForm();
      }
      setExpandedPurchaseId((current) => (current === purchaseId ? null : current));
      purchasesQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
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
        <form onSubmit={handleManualSubmit} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
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
              Updating record from {dayjs(editingPurchase.purchaseDate).format("DD MMM YYYY")}
            </p>
          )}
          {!canEdit && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              You are in view-only mode. Admins can add or edit purchase records.
            </p>
          )}
          <fieldset
            disabled={!canEdit}
            className={canEdit ? "" : "mt-4 cursor-not-allowed opacity-60"}
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

            <div className="mt-4 space-y-3">
              {manualLines.map((line, idx) => (
                <div key={line.id} className="grid gap-3 rounded-2xl border border-slate-100 p-3 md:grid-cols-5">
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">SKU / Item name</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        placeholder="SKU"
                        value={line.sku}
                        onChange={(e) => handleManualChange(line.id, "sku", e.target.value)}
                        className="w-1/2 rounded-lg border border-slate-200 px-2 py-2"
                      />
                      <input
                        type="text"
                        placeholder="Name"
                        value={line.name}
                        onChange={(e) => handleManualChange(line.id, "name", e.target.value)}
                        className="w-1/2 rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Quantity</label>
                    <input
                      type="number"
                      min={0}
                      value={line.quantityUnits}
                      onChange={(e) => handleManualChange(line.id, "quantityUnits", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">MRP</label>
                    <input
                      type="number"
                      min={0}
                      value={line.mrpPrice}
                      onChange={(e) => handleManualChange(line.id, "mrpPrice", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Cost</label>
                    <input
                      type="number"
                      min={0}
                      value={line.unitCostPrice}
                      onChange={(e) => handleManualChange(line.id, "unitCostPrice", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"
                    />
                  </div>
                  {manualLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setManualLines((prev) => prev.filter((entry) => entry.id !== line.id))
                      }
                      className="text-xs font-semibold text-red-500"
                    >
                      Remove line {idx + 1}
                    </button>
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
            <button
              type="submit"
              className="mt-4 w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {editingPurchase ? "Update purchase" : "Save purchase"}
            </button>
          </fieldset>
        </form>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Import CSV / XLSX</p>
          <p className="text-sm text-slate-500">
            Columns: sku, item_name, quantity_units, mrp_price, unit_cost_price, brand, category
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
            {importPreview && importPreview.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p>
                    Rows: <strong>{importPreview.length}</strong>, Units total:{" "}
                    <strong>{formatNumber(importSummary.quantity)}</strong>
                  </p>
                  {importSummary.linesWithIssues > 0 && (
                    <p className="text-red-500">
                      {importSummary.linesWithIssues} rows need attention before import.
                    </p>
                  )}
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">SKU / Item</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">MRP</th>
                        <th className="px-3 py-2">Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {importPreview.map((line) => (
                        <tr key={`${line.row}-${line.payload.sku ?? line.rawName}`}>
                          <td className="px-3 py-2">{line.row}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-900">
                              {line.payload.sku ?? "—"}
                            </p>
                            <p className="text-[11px] text-slate-500">{line.rawName}</p>
                          </td>
                          <td className="px-3 py-2">{line.payload.quantityUnits}</td>
                          <td className="px-3 py-2">₹{line.payload.mrpPrice}</td>
                          <td className="px-3 py-2 text-red-500">
                            {line.issues.length ? line.issues.join(", ") : "OK"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importSummary.linesWithIssues > 0}
                  className="w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Confirm import
                </button>
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
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-slate-900">Recent purchases</p>
          <span className="text-xs text-slate-500">Showing {activeFilterLabel}</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
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
                const totalCost =
                  purchase.totalCost ??
                  purchase.lineItems?.reduce(
                    (sum, line) => sum + Number(line.unitCostPrice ?? 0) * line.quantityUnits,
                    0,
                  ) ??
                  0;
                return (
                  <Fragment key={purchase.id}>
                    <tr>
                      <td className="py-2 text-slate-900">
                        {dayjs(purchase.purchaseDate).format("DD MMM YYYY")}
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
                                className="font-semibold text-red-500 hover:underline"
                              >
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
                        <td colSpan={6} className="bg-slate-50 px-4 py-3">
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
                                <p>Total cost: {formatCurrency(totalCost)}</p>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead className="text-left uppercase text-slate-400">
                                  <tr>
                                    <th className="py-1">Item</th>
                                    <th className="py-1">SKU</th>
                                    <th className="py-1">Qty</th>
                                    <th className="py-1">Unit cost</th>
                                    <th className="py-1">MRP</th>
                                    <th className="py-1 text-right">Line total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {purchase.lineItems.map((line) => {
                                    const unitCost = Number(line.unitCostPrice ?? 0);
                                    const mrpAtPurchase =
                                      line.mrpPriceAtPurchase !== null &&
                                      line.mrpPriceAtPurchase !== undefined
                                        ? Number(line.mrpPriceAtPurchase)
                                        : Number(line.item.mrpPrice ?? 0);
                                    const lineTotalCost = unitCost * line.quantityUnits;
                                    return (
                                      <tr key={line.id}>
                                        <td className="py-1 font-semibold text-slate-900">
                                          {line.item.name}
                                        </td>
                                        <td className="py-1 text-slate-500">{line.item.sku ?? "—"}</td>
                                        <td className="py-1">{formatNumber(line.quantityUnits)}</td>
                                        <td className="py-1">{formatCurrency(unitCost)}</td>
                                        <td className="py-1">{formatCurrency(mrpAtPurchase)}</td>
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
                  <td colSpan={6} className="py-6 text-center text-slate-500">
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
