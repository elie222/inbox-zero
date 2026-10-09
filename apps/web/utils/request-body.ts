/**
 * Reads a request body of a declared size. Stops as soon as the body passes
 * that size, so a body larger than it claims never gets buffered.
 */
export async function readRequestBytes(request: Request, maxBytes: number) {
  const header = request.headers.get("content-length");
  const declared = Number(header);
  if (!header || !Number.isSafeInteger(declared) || declared > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  const bytes = new Uint8Array(declared);
  let received = 0;
  const reader = request.body?.getReader();
  if (!reader) return declared === 0 ? bytes : null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > declared) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    bytes.set(value, received);
    received += value.byteLength;
  }
  return received === declared ? bytes : null;
}
