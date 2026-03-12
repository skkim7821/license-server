import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const HASH_PREFIX = "scrypt";

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${HASH_PREFIX}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHash] = storedHash.split(":");
  if (algorithm !== HASH_PREFIX || !salt || !expectedHash) {
    return false;
  }

  const calculatedHash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (expectedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, calculatedBuffer);
}
