import { z } from "zod";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const MIB = 1024 * 1024;
const STORAGE_KEY = "inbox-zero:local-mail-settings";
const CHANGE_EVENT = "inbox-zero:local-mail-settings-changed";
const settingsSchema = z
  .object({
    budgetBytes: z
      .number()
      .int()
      .min(64 * MIB)
      .max(Number.MAX_SAFE_INTEGER),
    attachmentBudgetBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    backfillEnabled: z.boolean(),
    pushEnabled: z.boolean(),
  })
  .refine((value) => value.attachmentBudgetBytes <= value.budgetBytes, {
    message: "Attachment storage must fit within total mail storage",
  });

export type LocalMailSettings = z.infer<typeof settingsSchema>;

export function readLocalMailSettings(): LocalMailSettings {
  try {
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const result = settingsSchema.safeParse(JSON.parse(stored));
      if (result.success) return result.data;
    }
  } catch {
    // Storage denial or an obsolete preference must not prevent online mail use.
  }
  const desktop = !!getInboxZeroDesktopApp();
  return {
    budgetBytes: (desktop ? 2048 : 500) * MIB,
    attachmentBudgetBytes: (desktop ? 250 : 50) * MIB,
    backfillEnabled: true,
    pushEnabled: true,
  };
}

export function writeLocalMailSettings(settings: LocalMailSettings) {
  const validated = settingsSchema.parse(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToLocalMailSettings(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
