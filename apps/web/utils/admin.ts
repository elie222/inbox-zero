import { env } from "@/env";

export function isAdmin({ email }: { email?: string | null }) {
  if (!email) return false;
  return env.ADMINS?.includes(email);
}
