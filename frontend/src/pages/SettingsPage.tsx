import { FormEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../api/client";
import type { AppSettings, SettingsPayload } from "../api/types";
import { useAuth } from "../providers/AuthProvider";

const recommendedSettings = {
  defaultBeltMarkupRupees: 20,
  defaultLowStockThreshold: 10,
};

export function SettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const [beltMarkup, setBeltMarkup] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings", "page"],
    queryFn: async () => {
      const response = await api.get<{ settings: AppSettings | null }>("/settings");
      return response.data.settings;
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const { defaultBeltMarkupRupees, defaultLowStockThreshold } = settingsQuery.data;
    setBeltMarkup(
      defaultBeltMarkupRupees !== null && defaultBeltMarkupRupees !== undefined
        ? String(defaultBeltMarkupRupees)
        : "",
    );
    setLowStockThreshold(
      defaultLowStockThreshold !== null && defaultLowStockThreshold !== undefined
        ? String(defaultLowStockThreshold)
        : "",
    );
  }, [settingsQuery.data]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload: SettingsPayload = {};
    if (beltMarkup) {
      payload.defaultBeltMarkupRupees = Number(beltMarkup);
    }
    if (lowStockThreshold) {
      payload.defaultLowStockThreshold = Number(lowStockThreshold);
    }
    setIsSaving(true);
    try {
      await api.put("/settings", payload);
      toast.success("Settings saved");
      settingsQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setBeltMarkup(String(recommendedSettings.defaultBeltMarkupRupees));
    setLowStockThreshold(String(recommendedSettings.defaultLowStockThreshold));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm uppercase text-slate-400">Admin settings</p>
          <h1 className="text-2xl font-semibold text-slate-900">Defaults & automation</h1>
        </div>
        <p className="text-sm text-slate-500">
          Configure belt markup used on the day-end screen and the low-stock threshold that powers
          alerts and dashboards.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-slate-900">Global defaults</p>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-semibold text-brand-600 hover:underline"
            disabled={!canEdit}
          >
            Use recommended values
          </button>
        </div>
        {!canEdit && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Viewers can see, but not edit, default settings.
          </p>
        )}
        <fieldset
          disabled={!canEdit}
          className={`mt-4 grid gap-4 md:grid-cols-2 ${canEdit ? "" : "cursor-not-allowed opacity-60"}`}
        >
          <div>
            <label className="text-xs font-medium text-slate-500">Default belt markup (₹)</label>
            <input
              type="number"
              min={0}
              value={beltMarkup}
              onChange={(e) => setBeltMarkup(e.target.value)}
              placeholder={String(recommendedSettings.defaultBeltMarkupRupees)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Applied whenever belt channel is selected without a custom override.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">
              Low stock threshold (units)
            </label>
            <input
              type="number"
              min={1}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              placeholder={String(recommendedSettings.defaultLowStockThreshold)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Used for low stock alerts unless an item-specific reorder level is set.
            </p>
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={isSaving || !canEdit}
          className="mt-4 w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
        >
          {isSaving ? "Saving…" : "Save defaults"}
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">How belt markup is used</p>
          <p className="mt-2 text-sm text-slate-500">
            The configured value becomes the default markup when capturing belt sales on the day-end
            screen. Users can still override it per report, but resetting the form will always fall
            back to this number.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Impacts belt revenue in previews & saved reports.</li>
            <li>Used by analytics when splitting retail vs belt totals.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Low stock automation</p>
          <p className="mt-2 text-sm text-slate-500">
            This threshold powers dashboard alerts and the low-stock list on the inventory page.
            Items with a custom reorder level will continue to use their own value.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Helps prioritize replenishment across all channels.</li>
            <li>Updates immediately after you save, no restart needed.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
