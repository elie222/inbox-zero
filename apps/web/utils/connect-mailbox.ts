import { WELCOME_PATH } from "@/utils/config";
import { normalizeInternalPath } from "@/utils/path";

export function getConnectMailboxNextPath(next: string | string[] | undefined) {
  const nextValue = Array.isArray(next) ? next[0] : next;
  const nextPath = normalizeInternalPath(nextValue);
  if (!nextPath || getPathname(nextPath) === "/connect-mailbox") {
    return WELCOME_PATH;
  }
  return nextPath;
}

function getPathname(path: string) {
  return new URL(path, "https://internal-path.example").pathname;
}
