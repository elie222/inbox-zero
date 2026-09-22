import { clearRecentSearchHistory } from "@/store/mail-search-history";
import { clearStoredSenderQueues } from "@/store/sender-queue";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { wipeOpfsMailEngine } from "@/utils/mail-engine/wasm-sqlite";

export async function wipeLocalMailbox() {
  clearStoredSenderQueues();
  clearRecentSearchHistory();
  const wipe = getInboxZeroDesktopApp()?.wipeMailbox;
  if (typeof wipe === "function") {
    await wipe();
    return;
  }
  await wipeOpfsMailEngine();
}
