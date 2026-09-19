import { tmpdir } from "node:os";
import { join } from "node:path";

export function accountMailUploadDirectory(accountId: string) {
  return join(tmpdir(), "inbox-zero-mail-uploads", accountId);
}
