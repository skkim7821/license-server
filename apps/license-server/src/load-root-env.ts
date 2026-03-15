import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const moduleDir = fileURLToPath(new URL(".", import.meta.url));

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../../.env"),
  resolve(moduleDir, "../.env"),
  resolve(moduleDir, "../../../.env"),
  resolve(moduleDir, "../../../../.env"),
];

const loaded = new Set<string>();
for (const envPath of candidates) {
  if (loaded.has(envPath) || !existsSync(envPath)) {
    continue;
  }
  config({ path: envPath });
  loaded.add(envPath);
  break;
}
