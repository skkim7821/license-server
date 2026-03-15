import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../../.env"),
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
