export type MailEngineRuntimeMode = "desktop-ipc" | "browser" | "unavailable";

export function selectMailEngineRuntimeMode(input: {
  desktopIpc: boolean;
  opfs: boolean;
}): MailEngineRuntimeMode {
  if (input.desktopIpc) return "desktop-ipc";
  if (input.opfs) return "browser";
  return "unavailable";
}

export function shouldStartMailEngine(input: {
  pathname: string | null;
  browserRequested?: boolean;
  desktopIpc: boolean;
}): boolean {
  if (input.desktopIpc || input.browserRequested) return true;
  const segments = input.pathname?.split("/").filter(Boolean) ?? [];
  if (segments.length === 2) {
    return segments[1] === "mail" || segments[1] === "compose";
  }
  return (
    segments.length === 3 &&
    segments[1] === "debug" &&
    segments[2] === "mail-queue"
  );
}
