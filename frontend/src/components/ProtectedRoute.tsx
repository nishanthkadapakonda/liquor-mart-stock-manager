import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { FullScreenLoader } from "./common/FullScreenLoader";

export function ProtectedRoute() {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
