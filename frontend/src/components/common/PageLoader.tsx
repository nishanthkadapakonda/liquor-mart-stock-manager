import { Spinner } from "./Spinner";

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = "Loading..." }: PageLoaderProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <Spinner size="lg" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

