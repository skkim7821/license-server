import { FormEvent, useState } from "react";
import type { ProductRecord } from "../types/api";

type ProductsPageProps = {
  products: ProductRecord[];
  onCreateProduct: (product: ProductRecord) => Promise<void>;
  onUpdateProduct: (code: string, payload: Partial<Omit<ProductRecord, "code">>) => Promise<void>;
  onDeleteProduct: (code: string) => Promise<void>;
};

export function ProductsPage({
  products,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
}: ProductsPageProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [maxDevices, setMaxDevices] = useState(1);
  const [defaultPeriod, setDefaultPeriod] = useState(30);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    const payload: ProductRecord = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      maxDevices: Number(maxDevices),
      defaultPeriod: Number(defaultPeriod),
    };

    if (!payload.code || !payload.name || payload.maxDevices < 1 || payload.defaultPeriod < 1) {
      return;
    }

    await onCreateProduct(payload);
    setCode("");
    setName("");
    setMaxDevices(1);
    setDefaultPeriod(30);
  }

  async function quickEdit(product: ProductRecord) {
    const nextName = prompt(`Product name for ${product.code}`, product.name);
    if (nextName === null) {
      return;
    }

    const nextMaxDevicesRaw = prompt(`Max devices for ${product.code}`, String(product.maxDevices));
    if (nextMaxDevicesRaw === null) {
      return;
    }

    const nextDefaultPeriodRaw = prompt(
      `Default period (days) for ${product.code}`,
      String(product.defaultPeriod)
    );
    if (nextDefaultPeriodRaw === null) {
      return;
    }

    const nextMaxDevices = Number(nextMaxDevicesRaw);
    const nextDefaultPeriod = Number(nextDefaultPeriodRaw);

    if (!nextName.trim() || !Number.isInteger(nextMaxDevices) || !Number.isInteger(nextDefaultPeriod)) {
      return;
    }

    if (nextMaxDevices < 1 || nextDefaultPeriod < 1) {
      return;
    }

    await onUpdateProduct(product.code, {
      name: nextName.trim(),
      maxDevices: nextMaxDevices,
      defaultPeriod: nextDefaultPeriod,
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Products</h1>
        <p>제품 등록 및 라이선스 기본 정책 관리</p>
      </header>

      <div className="layout-grid cols-2">
        <form className="card form" onSubmit={submitCreate}>
          <h2>Create Product</h2>
          <label>
            Product Code
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="PROD001"
              required
            />
          </label>
          <label>
            Product Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Starter Plan"
              required
            />
          </label>
          <label>
            Max Devices
            <input
              type="number"
              min={1}
              value={maxDevices}
              onChange={(event) => setMaxDevices(Number(event.target.value))}
              required
            />
          </label>
          <label>
            Default Period (days)
            <input
              type="number"
              min={1}
              value={defaultPeriod}
              onChange={(event) => setDefaultPeriod(Number(event.target.value))}
              required
            />
          </label>
          <button type="submit" className="btn">
            Create Product
          </button>
        </form>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Max Devices</th>
              <th>Default Period</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.code}>
                <td>{product.code}</td>
                <td>{product.name}</td>
                <td>{product.maxDevices}</td>
                <td>{product.defaultPeriod} days</td>
                <td className="actions">
                  <button type="button" className="btn secondary" onClick={() => void quickEdit(product)}>
                    Edit
                  </button>
                  <button type="button" className="btn danger" onClick={() => void onDeleteProduct(product.code)}>
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
