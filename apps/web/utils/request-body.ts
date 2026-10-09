/**
 * Reads a request body of a declared size, rejecting anything larger before
 * reading it so an oversized upload never gets buffered.
 */
export async function readRequestBytes(request: Request, maxBytes: number) {
  const header = request.headers.get("content-length");
  const declared = Number(header);
  if (!header || !Number.isSafeInteger(declared) || declared > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength === declared ? bytes : null;
}
