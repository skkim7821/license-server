import { FormEvent, useMemo, useState } from "react";
import type { ProductRecord } from "../types/api";
import type { LicenseRecord } from "../types/api";

type LicensesPageProps = {
  products: ProductRecord[];
  licenses: LicenseRecord[];
  onCreateLicense: (email: string, productCode: string) => Promise<void>;
  onExtend: (id: string, days: number) => Promise<void>;
  onSetStatus: (id: string, status: LicenseRecord["status"]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function LicensesPage({
  products,
  licenses,
  onCreateLicense,
  onExtend,
  onSetStatus,
  onDelete,
}: LicensesPageProps) {
  const [email, setEmail] = useState("");
  const [productCode, setProductCode] = useState("");

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.code.localeCompare(b.code)),
    [products]
  );

  async function submitLicense(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedProductCode = productCode.trim().toUpperCase();
    if (!normalizedEmail || !normalizedProductCode) {
      return;
    }
    await onCreateLicense(normalizedEmail, normalizedProductCode);
    setEmail("");
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Licenses</h1>
        <p>라이선스 발급, 상태 변경, 만료 관리</p>
      </header>

      <div className="layout-grid">
        <form className="card form" onSubmit={submitLicense}>
          <h2>Issue License</h2>
          <label>
            User Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              required
            />
          </label>
          <label>
            Product
            <select
              value={productCode}
              onChange={(event) => setProductCode(event.target.value)}
              required
            >
              <option value="">Select product code</option>
              {sortedProducts.map((product) => (
                <option key={product.code} value={product.code}>
                  {product.code} ({product.name})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Issue License
          </button>
          {sortedProducts.length === 0 ? (
            <p className="error-text">등록된 제품이 없습니다. Products 페이지에서 제품을 먼저 생성하세요.</p>
          ) : null}
        </form>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Product</th>
              <th>License Key</th>
              <th>Status</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {licenses.map((license) => (
              <tr key={license.id}>
                <td>{license.email}</td>
                <td>{license.productCode}</td>
                <td>{license.licenseKey}</td>
                <td>{license.status}</td>
                <td>{new Date(license.expiresAt).toLocaleString()}</td>
                <td className="actions">
                  <button type="button" className="btn secondary" onClick={() => void onExtend(license.id, 30)}>
                    +30d
                  </button>
                  <button type="button" className="btn secondary" onClick={() => void onSetStatus(license.id, "active")}>
                    Active
                  </button>
                  <button type="button" className="btn secondary" onClick={() => void onSetStatus(license.id, "expired")}>
                    Expired
                  </button>
                  <button type="button" className="btn secondary" onClick={() => void onSetStatus(license.id, "revoked")}>
                    Revoked
                  </button>
                  <button type="button" className="btn danger" onClick={() => void onDelete(license.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
