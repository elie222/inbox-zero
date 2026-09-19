import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { wipeOpfsMailEngine } from "@/utils/mail-engine/wasm-sqlite";

export async function wipeLocalMailbox() {
  const wipe = getInboxZeroDesktopApp()?.wipeMailbox;
  if (typeof wipe === "function") {
    await wipe();
    return;
  }
  await wipeOpfsMailEngine();
}
