import type { SqlValue } from "./driver";

/** Raw deflate, so any runtime reads bodies another runtime wrote. */
export type MessageBodyCodec = {
  deflate(bytes: Uint8Array): Promise<Uint8Array>;
  inflate(bytes: Uint8Array): Promise<Uint8Array>;
};

// Stored bodies are BLOBs whose first byte names their format, so the codec
// can change later without rewriting rows.
const UTF8_FORMAT = 0;
const DEFLATE_RAW_FORMAT = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const streamBodyCodec: MessageBodyCodec = {
  deflate: (bytes) => pipe(bytes, new CompressionStream("deflate-raw")),
  inflate: (bytes) => pipe(bytes, new DecompressionStream("deflate-raw")),
};

export async function encodeMessageBody(
  codec: MessageBodyCodec,
  body: string | null,
): Promise<Uint8Array | null> {
  if (body === null) return null;
  const utf8 = encoder.encode(body);
  const deflated = await codec.deflate(utf8);
  // Short bodies can grow under deflate; those are kept as plain UTF-8.
  return deflated.length < utf8.length
    ? withFormat(DEFLATE_RAW_FORMAT, deflated)
    : withFormat(UTF8_FORMAT, utf8);
}

export async function decodeMessageBody(
  codec: MessageBodyCodec,
  value: SqlValue | undefined,
): Promise<string | null> {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Uint8Array)) {
    throw new Error("Message body is not in the stored format");
  }
  const format = value[0];
  const payload = value.subarray(1);
  if (format === UTF8_FORMAT) return decoder.decode(payload);
  if (format === DEFLATE_RAW_FORMAT) {
    return decoder.decode(await codec.inflate(payload));
  }
  throw new Error(`Unknown message body format: ${format}`);
}

/** HTML is the body readers render, so its text part would be a second copy. */
export function storedTextPart(html: string | null, text: string | null) {
  return html ? null : text;
}

function withFormat(format: number, payload: Uint8Array) {
  const stored = new Uint8Array(payload.length + 1);
  stored[0] = format;
  stored.set(payload, 1);
  return stored;
}

async function pipe(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
) {
  const output = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(transform);
  return new Uint8Array(await new Response(output).arrayBuffer());
}
