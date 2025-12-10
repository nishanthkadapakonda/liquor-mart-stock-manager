import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { api, getErrorMessage } from "../api/client";
import type { Item } from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { useAuth } from "../providers/AuthProvider";

interface PriceHistoryEntry {
  purchaseId: number;
  purchaseDate: string;
  supplierName: string | null;
  quantityUnits: number;
  unitCostPrice: number;
  caseCostPrice: number | null;
  lineTotalPrice: number | null;
  runningTotalUnits: number;
  runningTotalValue: number;
  weightedAvgAtPurchase: number;
}

interface PriceHistoryResponse {
  item: {
    id: number;
    sku: string;
    name: string;
    mrpPrice: number;
    purchaseCostPrice: number | null;
    weightedAvgCostPrice: number | null;
    totalInventoryValue: number | null;
    currentStockUnits: number;
  };
  history: PriceHistoryEntry[];
  summary: {
    totalPurchases: number;
    totalUnitsPurchased: number;
    totalValuePurchased: number;
    currentWeightedAvg: number;
  };
}

const emptyItemForm = {
  sku: "",
  name: "",
  brandNumber: "",
  brand: "",
  productType: "",
  sizeCode: "",
  packType: "",
  packSizeLabel: "",
  unitsPerPack: "",
  category: "",
  volumeMl: "",
  mrpPrice: "",
  purchaseCostPrice: "",
  reorderLevel: "",
  currentStockUnits: "",
};

// Auto-generate SKU from composite key fields
function deriveSku(brandNumber: string, sizeCode: string, packType: string): string {
  const parts = [brandNumber, sizeCode, packType]
    .filter((part) => part && part.trim())
    .map((part) => part.trim().replace(/\s+/g, "").toUpperCase());
  return parts.length >= 2 ? parts.join("-") : "";
}

export function ItemsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => ({ ...emptyItemForm }));
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [priceHistoryItem, setPriceHistoryItem] = useState<Item | null>(null);
  const [priceHistoryData, setPriceHistoryData] = useState<PriceHistoryResponse | null>(null);
  const [loadingPriceHistory, setLoadingPriceHistory] = useState(false);
  const isEditing = Boolean(editingItem);

  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const response = await api.get<{ items: Item[] }>("/items");
      return response.data.items;
    },
  });

  const lowStockQuery = useQuery({
    queryKey: ["items", "low-stock"],
    queryFn: async () => {
      const response = await api.get<{ items: Item[]; threshold: number }>("/items/low-stock");
      return response.data;
    },
  });

  const filteredItems = useMemo(() => {
    if (!itemsQuery.data) return [];
    if (!search) return itemsQuery.data;
    const term = search.toLowerCase();
    return itemsQuery.data.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.brand ?? "").toLowerCase().includes(term) ||
        (item.brandNumber ?? "").toLowerCase().includes(term) ||
        (item.sizeCode ?? "").toLowerCase().includes(term) ||
        (item.productType ?? "").toLowerCase().includes(term),
    );
  }, [itemsQuery.data, search]);

  const visibleItems = useMemo(
    () => filteredItems.filter((item) => item.isActive !== false),
    [filteredItems],
  );

  const resetForm = () => {
    setForm({ ...emptyItemForm });
    setEditingItem(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const payload = {
        sku: form.sku || undefined, // Auto-generated if empty
        name: form.name,
      brandNumber: form.brandNumber || undefined,
      brand: form.brand || undefined,
      productType: form.productType || undefined,
      sizeCode: form.sizeCode || undefined,
      packType: form.packType || undefined,
      packSizeLabel: form.packSizeLabel || undefined,
      unitsPerPack: form.unitsPerPack ? Number(form.unitsPerPack) : undefined,
        category: form.category || undefined,
        volumeMl: form.volumeMl ? Number(form.volumeMl) : undefined,
        mrpPrice: Number(form.mrpPrice),
        purchaseCostPrice: form.purchaseCostPrice ? Number(form.purchaseCostPrice) : undefined,
        reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : undefined,
        currentStockUnits: form.currentStockUnits ? Number(form.currentStockUnits) : undefined,
      };

      const editedItemId = isEditing && editingItem ? editingItem.id : null;
      
      if (isEditing && editingItem) {
        await api.put(`/items/${editingItem.id}`, payload);
        toast.success("Item updated");
      } else {
        await api.post("/items", {
          ...payload,
          currentStockUnits: 0,
          isActive: true,
        });
        toast.success("Item added");
      }

      resetForm();
      
      // Scroll to and highlight the edited item after refetch completes
      if (editedItemId) {
        await Promise.all([itemsQuery.refetch(), lowStockQuery.refetch()]);
        
        // Wait a bit for DOM to update, then scroll and highlight
        setTimeout(() => {
          const rowElement = document.querySelector(`[data-item-id="${editedItemId}"]`);
          if (rowElement) {
            // Scroll to the row
            rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
            
            // Add highlight classes with animation
            rowElement.classList.add("bg-brand-100", "ring-2", "ring-brand-400", "transition-all", "duration-300");
            
            // Remove highlight after 3 seconds
            setTimeout(() => {
              rowElement.classList.remove("bg-brand-100", "ring-2", "ring-brand-400", "transition-all", "duration-300");
            }, 3000);
          }
        }, 100);
      } else {
        itemsQuery.refetch();
        lowStockQuery.refetch();
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setForm({
      sku: item.sku ?? "",
      name: item.name ?? "",
      brandNumber: item.brandNumber ?? "",
      brand: item.brand ?? "",
      productType: item.productType ?? "",
      sizeCode: item.sizeCode ?? "",
      packType: item.packType ?? "",
      packSizeLabel: item.packSizeLabel ?? "",
      unitsPerPack:
        item.unitsPerPack !== null && item.unitsPerPack !== undefined ? String(item.unitsPerPack) : "",
      category: item.category ?? "",
      volumeMl: item.volumeMl !== null && item.volumeMl !== undefined ? String(item.volumeMl) : "",
      mrpPrice: item.mrpPrice !== null && item.mrpPrice !== undefined ? String(item.mrpPrice) : "",
      purchaseCostPrice:
        item.purchaseCostPrice !== null && item.purchaseCostPrice !== undefined
          ? String(item.purchaseCostPrice)
          : "",
      reorderLevel:
        item.reorderLevel !== null && item.reorderLevel !== undefined
          ? String(item.reorderLevel)
          : "",
      currentStockUnits: String(item.currentStockUnits ?? 0),
    });
  };

  const handleDelete = async (item: Item) => {
    if (!window.confirm(`Delete ${item.name}? This will archive the item.`)) {
      return;
    }
    try {
      await api.delete(`/items/${item.id}`);
      toast.success("Item deleted");
      if (editingItem?.id === item.id) {
        resetForm();
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      itemsQuery.refetch();
      lowStockQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} item(s)? This will archive them.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.delete(`/items/${id}`)));
      toast.success(`${selectedIds.size} item(s) deleted`);
      if (editingItem && selectedIds.has(editingItem.id)) {
        resetForm();
      }
      setSelectedIds(new Set());
      itemsQuery.refetch();
      lowStockQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleItems.map((item) => item.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Handle form field changes with SKU auto-fill
  const handleFormChange = (key: string, value: string) => {
    setForm((prev) => {
      const updated = { ...prev, [key]: value };
      
      // Auto-fill SKU when composite key fields change
      const skuFields = ["brandNumber", "sizeCode", "packType"];
      if (skuFields.includes(key)) {
        updated.sku = deriveSku(updated.brandNumber, updated.sizeCode, updated.packType);
      }
      
      return updated;
    });
  };

  // Fetch price history for an item
  const handleViewPriceHistory = async (item: Item) => {
    setPriceHistoryItem(item);
    setLoadingPriceHistory(true);
    try {
      const response = await api.get<PriceHistoryResponse>(`/items/${item.id}/price-history`);
      setPriceHistoryData(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error));
      setPriceHistoryItem(null);
    } finally {
      setLoadingPriceHistory(false);
    }
  };

  const closePriceHistory = () => {
    setPriceHistoryItem(null);
    setPriceHistoryData(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Inventory</p>
          <h1 className="text-2xl font-semibold text-slate-900">Items & Stock</h1>
        </div>
        <input
          type="text"
          placeholder="Search by SKU, name, brand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-full border border-slate-200 px-4 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {/* Catalog Section - Full Width, Fixed Height with Scroll */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" style={{ height: '80vh' }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-slate-900">Catalog ({filteredItems.length})</p>
          <p className="flex-1 text-xs text-slate-500">
            Showing {visibleItems.length} active item{visibleItems.length === 1 ? "" : "s"}
          </p>
          {canEdit && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : `Delete (${selectedIds.size})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => itemsQuery.refetch()}
            className="text-xs font-semibold text-brand-600"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 overflow-auto" style={{ height: 'calc(100% - 40px)' }}>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                {canEdit && (
                  <th className="w-10 py-2">
                    <input
                      type="checkbox"
                      checked={visibleItems.length > 0 && selectedIds.size === visibleItems.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                )}
                <th className="py-2">Brand No / Name</th>
                <th className="py-2">Type / Size</th>
                <th className="py-2">Pack/Qty</th>
                <th className="py-2">MRP / Avg Cost</th>
                <th className="py-2">Stock</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleItems.map((item) => (
                <tr key={item.id} data-item-id={item.id} className={`align-top ${selectedIds.has(item.id) ? "bg-brand-50" : ""}`}>
                  {canEdit && (
                    <td className="py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                  )}
                  <td className="py-3">
                    <p className="font-semibold text-slate-900">
                      #{item.brandNumber ?? "—"} {item.name}
                    </p>
                    <p className="text-xs text-slate-500">SKU: {item.sku}</p>
                  </td>
                  <td className="py-3 text-slate-600">
                    <p>{item.productType ?? "—"}</p>
                    <p className="text-xs text-slate-400">
                      Size: {item.sizeCode ?? "—"}
                      {item.packType ? ` • ${item.packType}` : ""}
                    </p>
                  </td>
                  <td className="py-3 text-slate-600">
                    <p>{item.packSizeLabel ?? "—"}</p>
                    <p className="text-xs text-slate-400">
                      {item.unitsPerPack ? `${item.unitsPerPack} units/case` : "—"}
                    </p>
                  </td>
                  <td className="py-3 text-slate-600">
                    <p>{formatCurrency(item.mrpPrice)}</p>
                    {item.weightedAvgCostPrice && (
                      <p className="text-xs text-slate-400">
                        Avg: {formatCurrency(item.weightedAvgCostPrice)}
                      </p>
                    )}
                  </td>
                  <td className="py-3">
                    <p className="font-semibold text-slate-900">{formatNumber(item.currentStockUnits)}</p>
                    <p className="text-xs text-slate-400">
                      Reorder: {item.reorderLevel ?? lowStockQuery.data?.threshold ?? 10}
                    </p>
                  </td>
                  <td className="py-3 text-right text-xs">
                    <button
                      type="button"
                      onClick={() => handleViewPriceHistory(item)}
                      className="font-semibold text-emerald-600 hover:underline"
                    >
                      Pricing
                    </button>
                    {canEdit && (
                      <>
                        <span className="px-1 text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          Edit
                        </button>
                        <span className="px-1 text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="font-semibold text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {visibleItems.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="py-6 text-center text-slate-500">
                    No items match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Form Section - Full Width at Bottom (for creating new items) */}
      {!isEditing && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold text-slate-900">Create / Import Item</p>
          </div>
          {!canEdit && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              You have read-only access. Ask an admin if you need to add or edit stock items.
            </p>
          )}
          <fieldset
            disabled={!canEdit}
            className={`mt-4 grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4 ${canEdit ? "" : "cursor-not-allowed opacity-60"}`}
          >
            {Object.entries({
              brandNumber: "Brand No *",
              name: "Brand Name *",
              productType: "Product Type (e.g. Beer, IML)",
              sizeCode: "Size Code (e.g. BE, DD, PP, QQ)",
              packType: "Issue Type (e.g. S, P, G)",
              packSizeLabel: "Pack/Qty (e.g. 12 / 650ml)",
              unitsPerPack: "Units per case",
              mrpPrice: "MRP Price (per unit) *",
              purchaseCostPrice: "Cost Price (per unit)",
              sku: "SKU (auto-generated if empty)",
              brand: "Brand (display)",
              category: "Category",
              volumeMl: "Bottle volume (ml)",
              reorderLevel: "Reorder Level",
            }).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-500">{label}</label>
                <input
                  type={
                    key === "unitsPerPack" || key === "volumeMl" || key === "mrpPrice" || key === "purchaseCostPrice" || key === "reorderLevel"
                      ? "number"
                      : "text"
                  }
                  placeholder={key === "sku" ? "Auto-generated from Brand# + Size + Issue" : undefined}
                  readOnly={key === "sku"}
                  value={(form as Record<string, string>)[key] ?? ""}
                  onChange={(e) => handleFormChange(key, e.target.value)}
                  className={`mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${key === "sku" ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""}`}
                  required={key === "name" || key === "mrpPrice"}
                />
              </div>
            ))}
            <div className="flex items-end md:col-span-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                Save item
              </button>
            </div>
          </fieldset>
          <p className="mt-3 text-xs text-slate-400">
            Creating a purchase will increase stock automatically.
          </p>
        </form>
      )}

      {/* Edit Item Modal */}
      {isEditing && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Edit Item</h2>
                <p className="text-sm text-slate-500">SKU: {editingItem.sku} • {editingItem.name}</p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="max-h-[calc(90vh-200px)] overflow-y-auto p-6">
              {!canEdit && (
                <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  You have read-only access. Ask an admin if you need to edit stock items.
                </p>
              )}
              <fieldset
                disabled={!canEdit}
                className={`grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-3 ${canEdit ? "" : "cursor-not-allowed opacity-60"}`}
              >
                {Object.entries({
                  brandNumber: "Brand No *",
                  name: "Brand Name *",
                  productType: "Product Type (e.g. Beer, IML)",
                  sizeCode: "Size Code (e.g. BE, DD, PP, QQ)",
                  packType: "Issue Type (e.g. S, P, G)",
                  packSizeLabel: "Pack/Qty (e.g. 12 / 650ml)",
                  unitsPerPack: "Units per case",
                  mrpPrice: "MRP Price (per unit) *",
                  purchaseCostPrice: "Cost Price (per unit)",
                  sku: "SKU (auto-generated if empty)",
                  brand: "Brand (display)",
                  category: "Category",
                  volumeMl: "Bottle volume (ml)",
                  reorderLevel: "Reorder Level",
                  ...(isEditing ? { currentStockUnits: "Current Stock (units)" } : {}),
                }).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-slate-500">{label}</label>
                    <input
                      type={
                        key === "unitsPerPack" || key === "volumeMl" || key === "mrpPrice" || key === "purchaseCostPrice" || key === "reorderLevel" || key === "currentStockUnits"
                          ? "number"
                          : "text"
                      }
                      step={key === "currentStockUnits" || key === "unitsPerPack" || key === "reorderLevel" ? "1" : key === "mrpPrice" || key === "purchaseCostPrice" ? "0.0001" : undefined}
                      min={key === "currentStockUnits" || key === "unitsPerPack" || key === "reorderLevel" ? "0" : undefined}
                      placeholder={key === "sku" ? "Auto-generated from Brand# + Size + Issue" : undefined}
                      readOnly={key === "sku"}
                      value={(form as Record<string, string>)[key] ?? ""}
                      onChange={(e) => handleFormChange(key, e.target.value)}
                      className={`mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${key === "sku" ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""}`}
                      required={key === "name" || key === "mrpPrice"}
                    />
                  </div>
                ))}
              </fieldset>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canEdit}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  Update item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-slate-900">Low stock focus</p>
          <span className="text-xs text-slate-500">
            Threshold: {lowStockQuery.data?.threshold ?? 10} units
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(lowStockQuery.data?.items ?? []).map((item) => {
            const sizeInfo = item.packSizeLabel || `${item.sizeCode || ""}${item.packType ? ` ${item.packType}` : ""}`.trim();
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm"
              >
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  SKU: {item.sku}
                  {sizeInfo && ` • ${sizeInfo}`}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-red-600">{item.currentStockUnits} units left</p>
                  <p className="text-slate-500 text-xs">
                    Reorder &lt; {item.reorderLevel ?? lowStockQuery.data?.threshold ?? 10}
                  </p>
                </div>
              </div>
            );
          })}
          {(lowStockQuery.data?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-slate-500">All good! No low stock items right now.</p>
          )}
        </div>
      </div>

      {/* Price History Modal */}
      {priceHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Price History: {priceHistoryItem.name}
                </h2>
                <p className="text-sm text-slate-500">SKU: {priceHistoryItem.sku}</p>
              </div>
              <button
                type="button"
                onClick={closePriceHistory}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[calc(90vh-200px)] overflow-y-auto p-6">
              {loadingPriceHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"></div>
                </div>
              ) : priceHistoryData ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs uppercase text-slate-500">Current Stock</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {formatNumber(priceHistoryData.item.currentStockUnits)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-4">
                      <p className="text-xs uppercase text-blue-600">MRP Price</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatCurrency(priceHistoryData.item.mrpPrice)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-4">
                      <p className="text-xs uppercase text-emerald-600">Weighted Avg Cost</p>
                      <p className="text-2xl font-bold text-emerald-900">
                        {formatCurrency(priceHistoryData.summary.currentWeightedAvg)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="text-xs uppercase text-amber-600">Latest Purchase Cost</p>
                      <p className="text-2xl font-bold text-amber-900">
                        ₹{priceHistoryData.item.purchaseCostPrice?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* Weighted Average Explanation */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-800">How Weighted Average is Calculated:</p>
                    <p className="mt-1 text-sm text-emerald-700">
                      Total Value Purchased: {formatCurrency(priceHistoryData.summary.totalValuePurchased)} ÷ 
                      Total Units: {priceHistoryData.summary.totalUnitsPurchased} = 
                      <span className="font-bold"> {formatCurrency(priceHistoryData.summary.currentWeightedAvg)}/unit</span>
                    </p>
                    {priceHistoryData.item.totalInventoryValue && (
                      <p className="mt-1 text-sm text-emerald-700">
                        Current Inventory Value: {formatCurrency(priceHistoryData.item.totalInventoryValue)}
                      </p>
                    )}
                  </div>

                  {/* Purchase History Table */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-700">
                      Purchase History ({priceHistoryData.summary.totalPurchases} purchases)
                    </h3>
                    {priceHistoryData.history.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Supplier</th>
                              <th className="px-4 py-3 text-right">Qty</th>
                              <th className="px-4 py-3 text-right">Unit Cost</th>
                              <th className="px-4 py-3 text-right">Line Total</th>
                              <th className="px-4 py-3 text-right">Running Total</th>
                              <th className="px-4 py-3 text-right">Weighted Avg</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {priceHistoryData.history.map((entry, index) => (
                              <tr key={`${entry.purchaseId}-${index}`} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-600">
                                  {dayjs(entry.purchaseDate).format("DD MMM YYYY")}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {entry.supplierName || "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-slate-900">
                                  {formatNumber(entry.quantityUnits)}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-600">
                                  {formatCurrency(entry.unitCostPrice)}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-600">
                                  {formatCurrency(entry.unitCostPrice * entry.quantityUnits)}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-500">
                                  {formatNumber(entry.runningTotalUnits)} units / {formatCurrency(entry.runningTotalValue)}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                                  {formatCurrency(entry.weightedAvgAtPurchase)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="py-8 text-center text-slate-500">
                        No purchase history found for this item.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={closePriceHistory}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
