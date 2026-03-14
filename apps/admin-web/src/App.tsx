import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { adminApi, ApiError } from "./lib/api";
import { DashboardPage } from "./pages/DashboardPage";
import { LicensesPage } from "./pages/LicensesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProductsPage } from "./pages/ProductsPage";
import { UsersPage } from "./pages/UsersPage";
import { useAuth } from "./state/auth-context";
import type { LicenseRecord, ProductRecord, UserRecord } from "./types/api";

export function App() {
  const { token, clearAuth } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [message, setMessage] = useState<string>("");
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const [userResponse, productResponse, licenseResponse] = await Promise.all([
        adminApi.listUsers(token),
        adminApi.listProducts(token),
        adminApi.listLicenses(token),
      ]);
      setUsers(userResponse.users);
      setProducts(productResponse.products);
      setLicenses(licenseResponse.licenses);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAuth();
        navigate("/login");
      }
      setMessage(`load_failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }, [clearAuth, navigate, token]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function withRefresh(fn: () => Promise<void>, successMessage: string) {
    try {
      await fn();
      await fetchAll();
      setMessage(successMessage);
    } catch (error) {
      setMessage(`action_failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return (
    <>
      {message ? <div className="toast">{message}</div> : null}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage users={users} products={products} licenses={licenses} />} />
          <Route
            path="/users"
            element={
              <UsersPage
                users={users}
                onCreateUser={async (email, name) =>
                  withRefresh(() => adminApi.createUser(token!, email, name).then(() => undefined), "user_saved")
                }
                onUpdateUser={async (id, email, name) =>
                  withRefresh(
                    () => adminApi.updateUser(token!, id, email, name).then(() => undefined),
                    "user_updated"
                  )
                }
                onDeleteUser={async (id) =>
                  withRefresh(() => adminApi.deleteUser(token!, id).then(() => undefined), "user_deleted")
                }
              />
            }
          />
          <Route
            path="/products"
            element={
              <ProductsPage
                products={products}
                onCreateProduct={async (product) =>
                  withRefresh(() => adminApi.createProduct(token!, product).then(() => undefined), "product_created")
                }
                onUpdateProduct={async (code, payload) =>
                  withRefresh(() => adminApi.updateProduct(token!, code, payload).then(() => undefined), "product_updated")
                }
                onDeleteProduct={async (code) =>
                  withRefresh(() => adminApi.deleteProduct(token!, code).then(() => undefined), "product_deleted")
                }
              />
            }
          />
          <Route
            path="/licenses"
            element={
              <LicensesPage
                products={products}
                licenses={licenses}
                onCreateLicense={async (email, productCode) =>
                  withRefresh(
                    () => adminApi.createLicense(token!, email, productCode).then(() => undefined),
                    "license_created"
                  )
                }
                onExtend={async (id, days) =>
                  withRefresh(() => adminApi.extendLicense(token!, id, days).then(() => undefined), "license_extended")
                }
                onSetStatus={async (id, status) =>
                  withRefresh(
                    () => adminApi.setLicenseStatus(token!, id, status).then(() => undefined),
                    "license_status_updated"
                  )
                }
                onSuspend={async (id, payload) =>
                  withRefresh(
                    () => adminApi.suspendLicense(token!, id, payload).then(() => undefined),
                    "license_suspended"
                  )
                }
                onUnsuspend={async (id, payload) =>
                  withRefresh(
                    () => adminApi.unsuspendLicense(token!, id, payload).then(() => undefined),
                    "license_unsuspended"
                  )
                }
                onDelete={async (id) =>
                  withRefresh(() => adminApi.deleteLicense(token!, id).then(() => undefined), "license_deleted")
                }
              />
            }
          />
        </Route>
        <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
      </Routes>
    </>
  );
}
