import { env } from "@/env";
import { SafeError } from "@/utils/error";

export function isCleanerEnabled() {
  if (process.env.VERCEL === "1") return true;
  return !!env.NEXT_PUBLIC_CLEANER_ENABLED;
}

export function assertCleanerApiEnabled() {
  if (isCleanerEnabled()) return;

  throw new SafeError("Cleaner is not enabled", 404);
}
