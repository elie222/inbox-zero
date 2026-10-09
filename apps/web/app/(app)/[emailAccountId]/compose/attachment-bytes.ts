/**
 * Keeps the bytes of files attached in this browser so a Gmail draft can be
 * re-uploaded, and inline images shown, without downloading them again. Draft
 * JSON only stores references. Everything here is best effort: when the
 * browser has no origin private file system, callers read from the mailbox.
 */
const DIRECTORY = "compose-attachments";

export async function saveComposeAttachmentBytes(
  emailAccountId: string,
  attachmentId: string,
  file: Blob,
) {
  try {
    const directory = await getDirectory();
    const handle = await directory.getFileHandle(
      fileName(emailAccountId, attachmentId),
      { create: true },
    );
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  } catch {
    // The mailbox draft still has the file; it is read back from there.
  }
}

export async function readComposeAttachmentBytes(
  emailAccountId: string,
  attachmentId: string,
) {
  try {
    const directory = await getDirectory();
    const handle = await directory.getFileHandle(
      fileName(emailAccountId, attachmentId),
    );
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function deleteComposeAttachmentBytes(
  emailAccountId: string,
  attachmentIds: string[],
) {
  if (!attachmentIds.length) return;
  try {
    const directory = await getDirectory();
    await Promise.all(
      attachmentIds.map((attachmentId) =>
        directory
          .removeEntry(fileName(emailAccountId, attachmentId))
          .catch(() => undefined),
      ),
    );
  } catch {
    // Nothing stored, or storage is unavailable.
  }
}

async function getDirectory() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIRECTORY, { create: true });
}

function fileName(emailAccountId: string, attachmentId: string) {
  return `${emailAccountId}_${attachmentId}`.replace(/[^\w.-]/gu, "_");
}
