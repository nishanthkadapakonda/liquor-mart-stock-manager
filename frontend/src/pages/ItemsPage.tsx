import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../api/client";
import type { Item } from "../api/types";
import { formatNumber } from "../utils/formatters";
import { useAuth } from "../providers/AuthProvider";

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
};

export function ItemsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => ({ ...emptyItemForm }));
  const [editingItem, setEditingItem] = useState<Item | null>(null);
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
        sku: form.sku,
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
      };

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
      itemsQuery.refetch();
      lowStockQuery.refetch();
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
      itemsQuery.refetch();
      lowStockQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
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

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-1"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold text-slate-900">
              {isEditing ? "Edit item" : "Create / Import Item"}
            </p>
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel edit
              </button>
            )}
          </div>
          {isEditing && editingItem && (
            <p className="mt-1 text-xs text-slate-500">Updating SKU {editingItem.sku}</p>
          )}
          {!canEdit && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              You have read-only access. Ask an admin if you need to add or edit stock items.
            </p>
          )}
          <fieldset
            disabled={!canEdit}
            className={`mt-4 space-y-4 text-sm ${canEdit ? "" : "cursor-not-allowed opacity-60"}`}
          >
            {Object.entries({
              sku: "SKU",
              name: "Name",
              brandNumber: "Brand number",
              brand: "Brand name",
              productType: "Product type",
              sizeCode: "Size code",
              packType: "Pack type",
              packSizeLabel: "Pack label (e.g. 12 / 650ml)",
              unitsPerPack: "Units per pack",
              category: "Category",
              volumeMl: "Bottle volume (ml)",
              mrpPrice: "MRP Price",
              purchaseCostPrice: "Cost Price",
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
                  value={(form as Record<string, string>)[key] ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  required={key === "sku" || key === "name" || key === "mrpPrice"}
                />
              </div>
            ))}
            <button
              type="submit"
              className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {isEditing ? "Update item" : "Save item"}
            </button>
            <p className="text-xs text-slate-400">
              Creating a purchase will increase stock automatically.
            </p>
          </fieldset>
        </form>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Catalog ({filteredItems.length})</p>
            <p className="text-xs text-slate-500">
              Showing {visibleItems.length} active item{visibleItems.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => itemsQuery.refetch()}
              className="text-xs font-semibold text-brand-600"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Brand</th>
                  <th className="py-2">MRP</th>
                  <th className="py-2">Stock</th>
                  <th className="py-2">Reorder</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        SKU: {item.sku} • Brand #{item.brandNumber ?? "—"} • Size {item.sizeCode ?? "—"}
                      </p>
                      <p className="text-[11px] uppercase text-slate-400">
                        {item.productType ?? "—"}{" "}
                        {item.packSizeLabel ? `• ${item.packSizeLabel}` : item.unitsPerPack ? `• ${item.unitsPerPack} units` : ""}
                        {item.packType ? ` • ${item.packType}` : ""}
                      </p>
                    </td>
                    <td className="py-3 text-slate-600">
                      <p>{item.brand ?? "—"}</p>
                      <p className="text-xs text-slate-400">{item.category ?? item.productType ?? "—"}</p>
                    </td>
                    <td className="py-3 text-slate-600">₹{Number(item.mrpPrice)}</td>
                    <td className="py-3 font-semibold text-slate-900">
                      {formatNumber(item.currentStockUnits)}
                    </td>
                    <td className="py-3 text-slate-600">
                      {item.reorderLevel ?? lowStockQuery.data?.threshold ?? 10}
                    </td>
                    <td className="py-3 text-right text-xs">
                      {canEdit ? (
                        <>
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
                      ) : (
                        <span className="text-slate-400">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No items match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-slate-900">Low stock focus</p>
          <span className="text-xs text-slate-500">
            Threshold: {lowStockQuery.data?.threshold ?? 10} units
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(lowStockQuery.data?.items ?? []).map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm"
            >
              <p className="font-semibold text-slate-900">{item.name}</p>
              <p className="text-xs text-slate-500">SKU: {item.sku}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-red-600">{item.currentStockUnits} units left</p>
                <p className="text-slate-500 text-xs">
                  Reorder &lt; {item.reorderLevel ?? lowStockQuery.data?.threshold ?? 10}
                </p>
              </div>
            </div>
          ))}
          {(lowStockQuery.data?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-slate-500">All good! No low stock items right now.</p>
          )}
        </div>
      </div>
    </div>
  );
}
