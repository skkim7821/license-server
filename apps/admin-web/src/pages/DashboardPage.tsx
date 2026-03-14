import { useMemo } from "react";
import type { LicenseRecord, ProductRecord, UserRecord } from "../types/api";

type DashboardProps = {
  users: UserRecord[];
  products: ProductRecord[];
  licenses: LicenseRecord[];
};

export function DashboardPage({ users, products, licenses }: DashboardProps) {
  const metrics = useMemo(() => {
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);

    const expiresSoon = licenses.filter((item) => {
      const expiresAt = new Date(item.expiresAt);
      return expiresAt >= now && expiresAt <= weekLater;
    }).length;

    const expired = licenses.filter((item) => item.status === "expired").length;
    const suspended = licenses.filter((item) => item.status === "suspended").length;
    const revoked = licenses.filter((item) => item.status === "revoked").length;

    return { expiresSoon, expired, suspended, revoked };
  }, [licenses]);

  const productSummaries = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        licenseCount: licenses.filter((license) => license.productCode === product.code).length,
      })),
    [licenses, products]
  );

  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>운영 현황 요약</p>
      </header>
      <div className="metric-grid">
        <article className="card metric">
          <p>Users</p>
          <strong>{users.length}</strong>
        </article>
        <article className="card metric">
          <p>Products</p>
          <strong>{products.length}</strong>
        </article>
        <article className="card metric">
          <p>Licenses</p>
          <strong>{licenses.length}</strong>
        </article>
        <article className="card metric">
          <p>Expiring in 7 days</p>
          <strong>{metrics.expiresSoon}</strong>
        </article>
        <article className="card metric">
          <p>Expired / Suspended / Revoked</p>
          <strong>
            {metrics.expired} / {metrics.suspended} / {metrics.revoked}
          </strong>
        </article>
      </div>

      <div className="card table-wrap">
        <h2>Products Overview</h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Max Devices</th>
              <th>Default Period</th>
              <th>Licenses</th>
            </tr>
          </thead>
          <tbody>
            {productSummaries.map((product) => (
              <tr key={product.code}>
                <td>{product.code}</td>
                <td>{product.name}</td>
                <td>{product.maxDevices}</td>
                <td>{product.defaultPeriod} days</td>
                <td>{product.licenseCount}</td>
              </tr>
            ))}
            {productSummaries.length === 0 ? (
              <tr>
                <td colSpan={5}>No products registered yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
