export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
        <p className="text-sm font-medium">Loading Liquor Mart Manager…</p>
      </div>
    </div>
  );
}
