import { parser } from "stream-json/web";

type Token = parser.Token;

export function decodeGmailAttachmentStream(
  source: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  signal?.throwIfAborted();
  let depth = 0;
  let expectingData = false;
  let inData = false;
  let foundData = false;
  let remainder = "";
  let padding = false;
  const tokens = (source as unknown as ReadableStream<BufferSource>)
    // TextDecoderStream accepts any BufferSource, but ReadableStream is
    // invariant here, so the wider input type needs to be stated.
    .pipeThrough(new TextDecoderStream(), { signal })
    .pipeThrough(
      parser.asWebStream({
        packStrings: false,
        packNumbers: false,
        packKeys: true,
        streamKeys: false,
      }),
      { signal },
    );
  return tokens.pipeThrough(
    new TransformStream<Token, Uint8Array>({
      transform(token, controller) {
        if (expectingData) {
          if (token.name !== "startString")
            throw new Error("Invalid attachment data");
          expectingData = false;
          inData = true;
          return;
        }
        if (token.name === "startObject" || token.name === "startArray")
          depth++;
        if (token.name === "endObject" || token.name === "endArray") depth--;
        if (
          depth === 1 &&
          token.name === "keyValue" &&
          token.value === "data"
        ) {
          if (foundData) throw new Error("Duplicate attachment data");
          foundData = true;
          expectingData = true;
        } else if (inData && token.name === "stringChunk") {
          if (!/^[A-Za-z0-9_=-]*$/.test(token.value))
            throw new Error("Invalid attachment encoding");
          remainder += token.value;
          const index = remainder.indexOf("=");
          if (index !== -1) padding = true;
          const length = padding
            ? Math.floor(index / 4) * 4
            : Math.floor(remainder.length / 4) * 4;
          if (length > 0) {
            controller.enqueue(
              new Uint8Array(
                Buffer.from(remainder.slice(0, length), "base64url"),
              ),
            );
            remainder = remainder.slice(length);
          }
          if (
            padding &&
            (remainder.length > 4 || !/^[A-Za-z0-9_-]*={1,2}$/.test(remainder))
          )
            throw new Error("Invalid attachment padding");
        } else if (inData && token.name === "endString") {
          const bytes = Buffer.from(remainder, "base64url");
          if (
            remainder.length === 1 ||
            bytes.toString("base64url") !== remainder.replace(/=+$/, "") ||
            (padding && remainder.length !== 4)
          )
            throw new Error("Invalid attachment encoding");
          if (bytes.length) controller.enqueue(new Uint8Array(bytes));
          remainder = "";
          inData = false;
        }
      },
      flush() {
        if (!foundData || inData || expectingData)
          throw new Error("Missing attachment data");
      },
    }),
    { signal },
  );
}
