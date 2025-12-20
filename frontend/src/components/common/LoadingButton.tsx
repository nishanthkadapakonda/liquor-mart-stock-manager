import { Spinner } from "./Spinner";

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export function LoadingButton({ loading = false, children, disabled, className = "", ...props }: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 ${className} ${(disabled || loading) ? "cursor-not-allowed opacity-70" : ""}`}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

