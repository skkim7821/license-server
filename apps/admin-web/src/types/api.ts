export type AdminLoginResponse = {
  token: string;
  role: "super_admin" | "operator";
  type: "jwt" | "static";
};

export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductRecord = {
  code: string;
  name: string;
  maxDevices: number;
  defaultPeriod: number;
};

export type LicenseRecord = {
  id: string;
  licenseKey: string;
  email: string;
  productCode: string;
  expiresAt: string;
  status: "active" | "suspended" | "revoked" | "expired";
  blockReason: "abuse" | "manual_review" | "security_risk" | "server_impact" | "billing_issue" | "other" | null;
  blockedAt: string | null;
  blockedBy: string | null;
  blockNote: string | null;
  unblockedAt: string | null;
  unblockedBy: string | null;
  unblockedNote: string | null;
  maxDevices: number;
  deviceCount?: number;
  deviceIps?: string[];
};
