import { env } from "@/env";

export function isAdmin(email?: string | null) {
  if (!email) return false;
  return env.ADMINS?.includes(email);
}
