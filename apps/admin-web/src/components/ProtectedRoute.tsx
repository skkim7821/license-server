import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth-context";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
