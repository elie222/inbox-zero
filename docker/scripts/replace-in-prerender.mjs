#!/usr/bin/env node
// Replaces a build-time placeholder in a prerendered Next.js file without
// corrupting its React Server Components payload.
//
// Flight rows such as `2b:T536,<text>` carry the byte length of their content.
// A plain text substitution changes the content but not the length, so the
// client reads past the row, loses the rows after it, and throws React error
// #412 ("Connection closed"). This rewrites each row, recomputing the lengths
// of the rows it changes. It handles raw payloads (`.rsc`) and payloads
// embedded in HTML through `self.__next_f.push([...])` scripts.
//
// Usage: node replace-in-prerender.mjs <file> <placeholder> <value>

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Row tags followed by `<hex length>,` and that many bytes of content.
const LENGTH_PREFIXED_TAGS = new Set("TAOoUSsLlGgMmVb");
const TEXT_TAG = "T";

/**
 * Replaces every occurrence of `from` in `buffer` with `to`, reporting how
 * each original byte offset moves so chunk boundaries can be carried across.
 * An offset inside a replaced occurrence moves to the end of its replacement.
 */
function replaceBytes(buffer, from, to) {
  const pieces = [];
  const anchors = []; // [oldStart, newStart, oldEnd] per replaced occurrence
  let last = 0;
  let written = 0;
  for (
    let index = buffer.indexOf(from);
    index !== -1;
    index = buffer.indexOf(from, index + from.length)
  ) {
    pieces.push(buffer.subarray(last, index), to);
    written += index - last;
    anchors.push([index, written, index + from.length]);
    written += to.length;
    last = index + from.length;
  }
  pieces.push(buffer.subarray(last));
  return { bytes: Buffer.concat(pieces), anchors };
}

/**
 * Rewrites a Flight stream, returning the new bytes and a function that maps
 * an offset in the old stream to the matching offset in the new one.
 */
export function rewriteFlight(stream, placeholder, value) {
  const from = Buffer.from(placeholder);
  const to = Buffer.from(value);
  const out = [];
  const segments = []; // [oldStart, oldEnd, newStart, anchors | null, newLength]
  let position = 0;
  let written = 0;

  const emit = (oldStart, oldEnd, bytes, anchors) => {
    segments.push([oldStart, oldEnd, written, anchors, bytes.length]);
    out.push(bytes);
    written += bytes.length;
  };

  while (position < stream.length) {
    const colon = stream.indexOf(0x3a, position); // ":"
    const id = colon === -1 ? "" : stream.toString("latin1", position, colon);
    if (colon === -1 || !/^[0-9a-f]*$/.test(id)) {
      // Not a row boundary we understand: fall back to a plain replacement of the rest.
      const { bytes, anchors } = replaceBytes(
        stream.subarray(position),
        from,
        to,
      );
      emit(position, stream.length, bytes, anchors);
      break;
    }
    const tag = String.fromCharCode(stream[colon + 1]);
    const comma = LENGTH_PREFIXED_TAGS.has(tag)
      ? stream.indexOf(0x2c, colon + 2)
      : -1; // ","
    const lengthHex =
      comma === -1 ? "" : stream.toString("latin1", colon + 2, comma);
    if (comma !== -1 && /^[0-9a-f]+$/.test(lengthHex)) {
      const contentStart = comma + 1;
      const contentEnd = contentStart + Number.parseInt(lengthHex, 16);
      const content = stream.subarray(contentStart, contentEnd);
      const replaced =
        tag === TEXT_TAG
          ? replaceBytes(content, from, to)
          : { bytes: content, anchors: [] };
      emit(
        position,
        contentStart,
        Buffer.from(`${id}:${tag}${replaced.bytes.length.toString(16)},`),
        null,
      );
      emit(contentStart, contentEnd, replaced.bytes, replaced.anchors);
      position = contentEnd;
      continue;
    }
    const newline = stream.indexOf(0x0a, colon);
    const rowEnd = newline === -1 ? stream.length : newline + 1;
    const { bytes, anchors } = replaceBytes(
      stream.subarray(position, rowEnd),
      from,
      to,
    );
    emit(position, rowEnd, bytes, anchors);
    position = rowEnd;
  }

  const mapOffset = (offset) => {
    for (const [oldStart, oldEnd, newStart, anchors, newLength] of segments) {
      if (offset < oldStart || offset >= oldEnd) continue;
      if (!anchors) return newStart; // inside a rewritten length header
      let delta = 0;
      const local = offset - oldStart;
      for (const [start, newAt, end] of anchors) {
        if (local < start) break;
        if (local < end) return newStart + newAt + to.length;
        delta = newAt + to.length - end;
      }
      return Math.min(newStart + local + delta, newStart + newLength);
    }
    return written;
  };

  return { bytes: Buffer.concat(out), mapOffset };
}

// Next.js escapes these in inline scripts (htmlEscapeJsonString).
const HTML_ESCAPES = {
  "&": "\\u0026",
  ">": "\\u003e",
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};
const escapeForScript = (json) =>
  json.replace(/[&><\u2028\u2029]/g, (character) => HTML_ESCAPES[character]);

const PUSH = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;

export function rewriteHtml(html, placeholder, value) {
  const pushes = [];
  for (const match of html.matchAll(PUSH)) {
    let entry;
    try {
      entry = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (
      !Array.isArray(entry) ||
      (entry[0] !== 1 && entry[0] !== 3) ||
      typeof entry[1] !== "string"
    )
      continue;
    const argStart = match.index + match[0].indexOf(match[1]);
    pushes.push({
      type: entry[0],
      start: argStart,
      end: argStart + match[1].length,
      text: entry[1],
    });
  }

  // Everything outside the payload chunks is markup: a plain replacement is safe there.
  const replaceMarkup = (text) => text.split(placeholder).join(value);
  if (pushes.length === 0) return replaceMarkup(html);

  const chunks = pushes.map((push) =>
    push.type === 1 ? Buffer.from(push.text) : Buffer.from(push.text, "base64"),
  );
  const boundaries = [];
  let offset = 0;
  for (const chunk of chunks) {
    boundaries.push(offset);
    offset += chunk.length;
  }
  boundaries.push(offset);

  const { bytes, mapOffset } = rewriteFlight(
    Buffer.concat(chunks),
    placeholder,
    value,
  );
  const newBoundaries = boundaries.map((boundary, index) =>
    index === boundaries.length - 1 ? bytes.length : mapOffset(boundary),
  );

  let result = "";
  let cursor = 0;
  pushes.forEach((push, index) => {
    const slice = bytes.subarray(
      newBoundaries[index],
      newBoundaries[index + 1],
    );
    const payload =
      push.type === 1 ? slice.toString("utf8") : slice.toString("base64");
    result += replaceMarkup(html.slice(cursor, push.start));
    result += escapeForScript(JSON.stringify([push.type, payload]));
    cursor = push.end;
  });
  return result + replaceMarkup(html.slice(cursor));
}

export function rewriteFile(path, placeholder, value) {
  if (path.endsWith(".rsc")) {
    const { bytes } = rewriteFlight(readFileSync(path), placeholder, value);
    writeFileSync(path, bytes);
  } else {
    writeFileSync(
      path,
      rewriteHtml(readFileSync(path, "utf8"), placeholder, value),
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) ===
    realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const [path, placeholder, value = ""] = process.argv.slice(2);
  if (!path || !placeholder) {
    console.error(
      "Usage: replace-in-prerender.mjs <file> <placeholder> <value>",
    );
    process.exit(1);
  }
  rewriteFile(path, placeholder, value);
}
