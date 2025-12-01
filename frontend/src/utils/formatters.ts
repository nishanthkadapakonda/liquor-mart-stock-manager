export function formatCurrency(value: number | string | null | undefined, currency = "INR") {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isNaN(numeric) ? 0 : numeric);
}

export function formatNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Number.isNaN(numeric) ? 0 : numeric,
  );
}
