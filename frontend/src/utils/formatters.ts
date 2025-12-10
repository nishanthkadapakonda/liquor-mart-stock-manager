export function formatCurrency(value: number | string | null | undefined, currency = "INR") {
  const numeric = Number(value ?? 0);
  const safe = Number.isNaN(numeric) ? 0 : numeric;
  // Use toFixed to avoid 0.9999-style floating-point artifacts and then convert back to number
  const rounded = Number(safe.toFixed(4));

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rounded);
}

export function formatNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Number.isNaN(numeric) ? 0 : numeric,
  );
}
