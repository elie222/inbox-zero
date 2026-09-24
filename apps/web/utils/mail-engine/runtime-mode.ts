export type MailEngineRuntimeMode = "desktop-ipc" | "browser" | "unavailable";

export function selectMailEngineRuntimeMode(input: {
  desktopIpc: boolean;
  opfs: boolean;
}): MailEngineRuntimeMode {
  if (input.desktopIpc) return "desktop-ipc";
  if (input.opfs) return "browser";
  return "unavailable";
}
