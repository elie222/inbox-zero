import { describe, expect, it } from "vitest";
import {
  rewriteFlight,
  rewriteHtml,
} from "../../../docker/scripts/replace-in-prerender.mjs";

const PLACEHOLDER = "http://NEXT_PUBLIC_BASE_URL_PLACEHOLDER";
const SHORTER = "https://mail.example.com";
const LONGER = "https://inbox-zero.self-hosted.example.org";

const LENGTH_PREFIXED = "TAOoUSsLlGgMmVb";

// Reads a Flight stream the way the client does: rows are `<hex id>:` followed
// by a tagged, length-prefixed body or a newline-terminated line.
function parseRows(stream: Buffer) {
  const rows: { id: string; tag: string; body: string }[] = [];
  let position = 0;
  while (position < stream.length) {
    const colon = stream.indexOf(0x3a, position);
    const id = stream.toString("latin1", position, colon);
    if (colon === -1 || !/^[0-9a-f]*$/.test(id)) {
      throw new Error(`unparseable row at byte ${position}`);
    }
    const tag = String.fromCharCode(stream[colon + 1]);
    const comma = stream.indexOf(0x2c, colon + 2);
    const lengthHex = stream.toString("latin1", colon + 2, comma);
    if (LENGTH_PREFIXED.includes(tag) && /^[0-9a-f]+$/.test(lengthHex)) {
      const end = comma + 1 + Number.parseInt(lengthHex, 16);
      rows.push({ id, tag, body: stream.toString("utf8", comma + 1, end) });
      position = end;
    } else {
      const newline = stream.indexOf(0x0a, colon);
      const end = newline === -1 ? stream.length : newline + 1;
      rows.push({ id, tag, body: stream.toString("utf8", colon + 1, end) });
      position = end;
    }
  }
  return rows;
}

function textRow(id: string, text: string) {
  return `${id}:T${Buffer.byteLength(text).toString(16)},${text}`;
}

// A JSON-LD block long enough for React to outline it as a text row, holding
// the placeholder twice, followed by the rows the page depends on.
const jsonLd = JSON.stringify({
  "@type": "WebApplication",
  url: PLACEHOLDER,
  publisher: { url: PLACEHOLDER, name: "Ünïcode Inc." },
});
const stream = [
  ':HL["/_next/static/chunks/app.css","style"]\n',
  `0:{"P":null,"b":"build","c":["","$L2"]}\n`,
  textRow("2b", jsonLd),
  `1:["$","link","canonical",{"href":"${PLACEHOLDER}/"}]\n`,
  "3:A4,\u0001\u0002\u0003\u0004",
  '2:["$","main",null,{"children":"Welcome"}]\n',
].join("");

describe("rewriteFlight", () => {
  it("shows why a plain substitution breaks the payload", () => {
    const naive = Buffer.from(stream.split(PLACEHOLDER).join(SHORTER));
    expect(() => parseRows(naive)).toThrow();
  });

  it.each([
    ["shorter", SHORTER],
    ["longer", LONGER],
    ["empty", ""],
  ])("keeps every row readable with a %s value", (_label, value) => {
    const { bytes } = rewriteFlight(Buffer.from(stream), PLACEHOLDER, value);
    const rows = parseRows(bytes);

    expect(rows.map((row) => row.id)).toEqual(["", "0", "2b", "1", "3", "2"]);
    const text = rows.find((row) => row.id === "2b");
    expect(text?.body).toBe(jsonLd.split(PLACEHOLDER).join(value));
    expect(rows.find((row) => row.id === "1")?.body).toContain(
      `"href":"${value}/"`,
    );
    expect(bytes.includes(PLACEHOLDER)).toBe(false);
  });

  it("leaves binary rows untouched", () => {
    const { bytes } = rewriteFlight(Buffer.from(stream), PLACEHOLDER, SHORTER);
    const binary = parseRows(bytes).find((row) => row.id === "3");
    expect(Buffer.from(binary?.body ?? "", "utf8")).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
  });
});

describe("rewriteHtml", () => {
  const escapeScriptJson = (json: string) =>
    json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  // Split the stream mid text row, as streamed pages do, across two chunks.
  const cut = stream.indexOf("publisher");
  const push = (text: string) =>
    `<script>self.__next_f.push(${escapeScriptJson(JSON.stringify([1, text]))})</script>`;
  const html = [
    "<!DOCTYPE html><html><head>",
    `<link rel="canonical" href="${PLACEHOLDER}/"/>`,
    "<script>(self.__next_f=self.__next_f||[]).push([0])</script>",
    "</head><body><main>Welcome</main>",
    push(stream.slice(0, cut)),
    push(stream.slice(cut)),
    "</body></html>",
  ].join("");

  const flightOf = (page: string) =>
    Buffer.concat(
      [...page.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)]
        .map((match) => JSON.parse(match[1]))
        .filter((entry) => entry[0] === 1)
        .map((entry) => Buffer.from(entry[1])),
    );

  it("fixes payloads split across script chunks", () => {
    const result = rewriteHtml(html, PLACEHOLDER, SHORTER);
    const rows = parseRows(flightOf(result));

    expect(rows.map((row) => row.id)).toEqual(["", "0", "2b", "1", "3", "2"]);
    expect(rows.find((row) => row.id === "2b")?.body).toBe(
      jsonLd.split(PLACEHOLDER).join(SHORTER),
    );
    expect([...result.matchAll(/__next_f\.push\(\[1,/g)]).toHaveLength(2);
  });

  it("replaces markup and keeps scripts HTML-safe", () => {
    const result = rewriteHtml(html, PLACEHOLDER, SHORTER);

    expect(result).toContain(`<link rel="canonical" href="${SHORTER}/"/>`);
    expect(result.includes(PLACEHOLDER)).toBe(false);
    for (const match of result.matchAll(
      /self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g,
    )) {
      expect(match[1]).not.toMatch(/[<>]/);
    }
  });
});
