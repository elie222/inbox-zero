import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { platform, release } from "node:os";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";

console.log = console.warn = (...values) => {
  process.stderr.write(`${values.join(" ")}\n`);
};

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const input = readFileSync(0);
if (input.length > 36 * 1024 * 1024) throw new Error("Input limit");
const request = JSON.parse(input.toString("utf8"));
if (request.operation !== "pdf") throw new Error("Unsupported operation");
const data = Buffer.from(request.data, "base64");
if (data.length > 25 * 1024 * 1024) throw new Error("PDF byte limit");
const loading = getDocument({
  data: new Uint8Array(data),
  useSystemFonts: false,
  disableFontFace: true,
  isEvalSupported: false,
  standardFontDataUrl: join(root, "standard_fonts/"),
  cMapUrl: join(root, "cmaps/"),
  cMapPacked: true,
  wasmUrl: join(root, "wasm/"),
});
const result = {
  version: 1,
  backend: "portable-2",
  osVersion: `${platform()} ${release()}`,
  valid: false,
};
try {
  const pdf = await loading.promise;
  if (pdf.numPages > 200) throw new Error("PDF page limit");
  const { info } = await pdf.getMetadata();
  const attributes = Object.entries(info)
    .filter(
      ([key, value]) =>
        [
          "Title",
          "Author",
          "Subject",
          "Keywords",
          "Creator",
          "Producer",
        ].includes(key) && typeof value === "string",
    )
    .map(([, value]) => value);
  const pages = [],
    thumbnails = [];
  let length = 0;
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) =>
        "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
      )
      .join("");
    length += Buffer.byteLength(text);
    if (length > 4 * 1024 * 1024) throw new Error("PDF text limit");
    pages.push(text);
    if (index <= 3) {
      const original = page.getViewport({ scale: 1 });
      if (
        !Number.isFinite(original.width * original.height) ||
        original.width * original.height > 16_000_000
      )
        throw new Error("PDF image limit");
      const viewport = page.getViewport({
        scale: Math.min(1, 1024 / Math.max(original.width, original.height)),
      });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvasContext: canvas.getContext("2d"),
        canvas,
        viewport,
      }).promise;
      const gif = await sharp(await canvas.encode("png"))
        .gif()
        .toBuffer();
      thumbnails.push({ data: gif.toString("base64"), hasAlpha: false });
    }
    page.cleanup();
  }
  Object.assign(result, {
    valid: true,
    pageCount: pdf.numPages,
    attributes,
    pages,
    thumbnails,
  });
} catch (error) {
  if (!["InvalidPDFException", "PasswordException"].includes(error?.name))
    throw error;
} finally {
  await loading.destroy();
}
const output = JSON.stringify(result);
if (Buffer.byteLength(output) > 16 * 1024 * 1024)
  throw new Error("Output limit");
process.stdout.write(output);
