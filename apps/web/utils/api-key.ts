import { env } from "@/env";
import { randomBytes, scryptSync } from "node:crypto";

export function generateSecureToken(): string {
  return randomBytes(32).toString("base64");
}

export function hashApiKey(apiKey: string): string {
  if (!env.API_KEY_SALT) throw new Error("API_KEY_SALT is not set");
  const derivedKey = scryptSync(apiKey, env.API_KEY_SALT, 64);
  return `${env.API_KEY_SALT}:${derivedKey.toString("hex")}`;
}
