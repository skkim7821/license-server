import { randomBytes } from "node:crypto";

export function generateLicenseKey(): string {
  const raw = randomBytes(12).toString("hex").toUpperCase();
  return `LIC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 24)}`;
}
