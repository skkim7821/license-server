import type { AdminLoginResponse, LicenseRecord, ProductRecord, UserRecord } from "../types/api";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type ApiRequestOptions = {
  method?: HttpMethod;
  token?: string;
  body?: unknown;
};

type ApiErrorPayload = {
  error?: string;
  reason?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    const message = payload.error ?? payload.reason ?? `request_failed_${response.status}`;
    throw new ApiError(response.status, message);
  }

  return payload;
}

export const adminApi = {
  login(email: string, password: string) {
    return request<AdminLoginResponse>("/admin/login", {
      method: "POST",
      body: { email, password },
    });
  },
  listUsers(token: string) {
    return request<{ users: UserRecord[] }>("/admin/users", { token });
  },
  listProducts(token: string) {
    return request<{ products: ProductRecord[] }>("/admin/products", { token });
  },
  createProduct(token: string, payload: ProductRecord) {
    return request<{ product: ProductRecord }>("/admin/products", {
      method: "POST",
      token,
      body: payload,
    });
  },
  updateProduct(token: string, code: string, payload: Partial<Omit<ProductRecord, "code">>) {
    return request<{ product: ProductRecord }>(`/admin/products/${encodeURIComponent(code)}`, {
      method: "PATCH",
      token,
      body: payload,
    });
  },
  deleteProduct(token: string, code: string) {
    return request<{ deleted: boolean; code: string }>(`/admin/products/${encodeURIComponent(code)}`, {
      method: "DELETE",
      token,
    });
  },
  createUser(token: string, email: string, name?: string) {
    return request<{ user: UserRecord }>("/admin/users", {
      method: "POST",
      token,
      body: { email, name },
    });
  },
  updateUser(token: string, id: string, email?: string, name?: string) {
    return request<{ user: UserRecord }>(`/admin/users/${id}`, {
      method: "PATCH",
      token,
      body: { email, name },
    });
  },
  deleteUser(token: string, id: string) {
    return request<{ deleted: boolean; id: string }>(`/admin/users/${id}`, {
      method: "DELETE",
      token,
    });
  },
  listLicenses(token: string) {
    return request<{ licenses: LicenseRecord[] }>("/admin/licenses", { token });
  },
  createLicense(token: string, email: string, productCode: string) {
    return request<{ license: LicenseRecord }>("/admin/licenses", {
      method: "POST",
      token,
      body: { email, productCode },
    });
  },
  extendLicense(token: string, id: string, days: number) {
    return request<{ license: LicenseRecord }>(`/admin/licenses/${id}/extend`, {
      method: "PATCH",
      token,
      body: { days },
    });
  },
  setLicenseStatus(token: string, id: string, status: "active" | "revoked") {
    return request<{ license: LicenseRecord }>(`/admin/licenses/${id}/status`, {
      method: "PATCH",
      token,
      body: { status },
    });
  },
  suspendLicense(
    token: string,
    id: string,
    payload: {
      reason: "abuse" | "manual_review" | "security_risk" | "server_impact" | "billing_issue" | "other";
      blockedBy?: string;
      note?: string;
    }
  ) {
    return request<{ license: LicenseRecord }>(`/admin/licenses/${id}/suspend`, {
      method: "PATCH",
      token,
      body: payload,
    });
  },
  unsuspendLicense(token: string, id: string, payload?: { unblockedBy?: string; note?: string }) {
    return request<{ license: LicenseRecord }>(`/admin/licenses/${id}/unsuspend`, {
      method: "PATCH",
      token,
      body: payload ?? {},
    });
  },
  deleteLicense(token: string, id: string) {
    return request<{ deleted: boolean; id: string }>(`/admin/licenses/${id}`, {
      method: "DELETE",
      token,
    });
  },
};
