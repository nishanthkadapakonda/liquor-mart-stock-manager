export function formatCurrency(value: number | string | null | undefined, currency = "INR") {
  const numeric = Number(value ?? 0);
  const rounded = Math.round((Number.isNaN(numeric) ? 0 : numeric) * 100) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function formatNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Number.isNaN(numeric) ? 0 : numeric,
  );
}
