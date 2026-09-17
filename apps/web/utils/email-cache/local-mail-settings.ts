import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const MIB = 1024 * 1024;

export function readLocalMailSettings() {
  const desktop = !!getInboxZeroDesktopApp();
  return {
    budgetBytes: (desktop ? 2048 : 500) * MIB,
    attachmentBudgetBytes: (desktop ? 250 : 50) * MIB,
  };
}
