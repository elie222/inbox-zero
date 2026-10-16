export type MailEngineStartupStage =
  | "tab-channel"
  | "owner-lock"
  | "browser-start"
  | "worker-load"
  | "worker-start"
  | "wasm-init"
  | "opfs-open"
  | "store-init"
  | "account-init"
  | "initial-sync"
  | "publish-client"
  | "desktop-client"
  | "desktop-sync";

export class MailEngineStartupError extends Error {
  readonly stage: MailEngineStartupStage;

  constructor(stage: MailEngineStartupStage, error: unknown) {
    super(
      error instanceof Error ? error.message : "Mail engine startup failed",
    );
    this.name = error instanceof Error ? error.name : "Error";
    this.stage = stage;
    // Preserve the failing call site without copying arbitrary error payloads.
    if (error instanceof Error && error.stack) this.stack = error.stack;
  }
}
