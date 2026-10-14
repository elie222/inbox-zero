import { createHash } from "node:crypto";
import sharp from "sharp";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { type SpamTokenizer, tokenizeMessage } from "./tokenizer";
import { extractPdf } from "./extractor";
import { tokenizeWithLanguage } from "./native-tokenizer";

export async function extractSpamFeatures(
  message: ParsedMessage,
  provider: EmailProvider,
) {
  const tokenizer = await tokenizeWithLanguage((tokens) => {
    tokenizeMessage(message, tokens);
  });
  let totalBytes = 0;
  for (const attachment of [
    ...(message.attachments ?? []),
    ...message.inline,
  ]) {
    if (attachment.size > 25 * 1024 * 1024)
      throw new Error("Attachment exceeds spam inspection limit");
    const result = await provider.getAttachment(
      message.id,
      attachment.attachmentId,
    );
    const data = Buffer.from(result.data, "base64");
    totalBytes += data.length;
    if (totalBytes > 25 * 1024 * 1024)
      throw new Error("Attachments exceed spam inspection limit");
    const filename = attachment.filename;
    const sanitized = filename.replace(
      /[^\p{Alphabetic}\p{Decimal_Number}]/gu,
      "-",
    );
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    const size = data.length ? Math.trunc(Math.log(data.length) / Math.LN2) : 0;
    tokenizer.add("^file", "", false);
    tokenizer.add("^mm", "", false);
    tokenizer.add(`^file-name-${sanitized}`, "", false);
    tokenizer.add(
      `^fb-${filename.replace(/\.[^.]*$/u, "").replace(/[^\p{Alphabetic}\p{Decimal_Number}]/gu, "-")}`,
      "",
      false,
    );
    tokenizer.add(`^fe-${extension}`, "", false);
    tokenizer.add(`^file-size-${size}`, "", false);
    tokenizer.add(`^fes-${extension}-${size}`, "", false);
    tokenizer.add(
      `^i5-${createHash("md5").update(data).digest("hex").slice(0, 8)}`,
      "",
      false,
    );
    if (extension === "zip") {
      if (data.length >= 4)
        tokenizer.add(
          `^fzmg-${data.subarray(0, 4).toString("base64")}`,
          "",
          false,
        );
    } else if (
      attachment.mimeType === "application/pdf" ||
      extension === "pdf" ||
      extension === "fdf"
    )
      await collectPdf(data, tokenizer);
    else if (attachment.mimeType.startsWith("image/"))
      await collectImage(data, tokenizer);
  }
  return tokenizer;
}

export async function collectImage(data: Buffer, tokenizer: SpamTokenizer) {
  try {
    const metadata = await sharp(data, {
      animated: true,
      limitInputPixels: 40_000_000,
    }).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error("Missing dimensions");
    const density = metadata.format === "gif" ? 72 : (metadata.density ?? 72);
    const height = metadata.pageHeight ?? metadata.height;
    tokenizer.add(
      `^iw-${Math.round((metadata.width * 72) / density)}`,
      "",
      false,
    );
    tokenizer.add(`^ih-${Math.round((height * 72) / density)}`, "", false);
    const frames = metadata.pages ?? 0;
    if (frames >= 2) {
      tokenizer.add("^ia", "", false);
      tokenizer.add(`^ifc-${frames}`, "", false);
    }
    tokenizer.add(`^iha-${Number(metadata.hasAlpha)}`, "", false);
    for (let frame = 0; frame < Math.max(frames, 1); frame++) {
      collectGifPalette(data, frame, tokenizer);
      const delay = metadata.delay?.[frame];
      if (delay !== undefined && frames >= 2) {
        const seconds = Math.trunc(delay / 1000);
        tokenizer.add(`^ifd-${seconds}`, "", false);
        tokenizer.add(`^ifn-${frame}-d-${seconds}`, "", false);
      }
    }
  } catch {
    tokenizer.add("^i-bad", "", false);
  }
}

export function collectGifPalette(
  data: Buffer,
  frame: number,
  tokenizer: SpamTokenizer,
) {
  if (
    data.length < 13 ||
    !["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii")) ||
    !(data[10] & 0x80)
  )
    return;
  const length = 3 * 2 ** ((data[10] & 7) + 1);
  if (data.length < 13 + length) return;
  const palette = data.subarray(13, 13 + length);
  tokenizer.add(`^icts-${length}`, "", false);
  tokenizer.add(
    `^ict${frame === 0 ? "0" : ""}-${createHash("md5").update(palette).digest("base64")}`,
    "",
    false,
  );
  let black = false;
  let white = false;
  for (let index = 0; index < length; index += 3) {
    const color = palette.subarray(index, index + 3).toString("hex");
    if (color === "000000") black = true;
    else tokenizer.add(color, "^color", false);
    if (color === "ffffff") white = true;
  }
  if (!black) tokenizer.add("!b", "^color", false);
  if (!white) tokenizer.add("!w", "^color", false);
}

export async function collectPdf(data: Buffer, tokenizer: SpamTokenizer) {
  const pdf = await extractPdf(data);
  if (!pdf.valid) {
    tokenizer.add(
      `^bad-pdf-${createHash("md5").update(data).digest("hex")}`,
      "",
      false,
    );
    return;
  }
  if (pdf.backend !== "apple-1")
    tokenizer.warnings.add("portable-pdf-rendering");
  tokenizer.add(`^ippc-${pdf.pageCount}`, "", false);
  if (pdf.pageCount! >= 4) tokenizer.add("^ippc-l", "", false);
  const words = await tokenizeWithLanguage((tokens) => {
    for (const value of pdf.attributes!) tokens.words(value, "^pdfa");
    for (const value of pdf.pages!) tokens.words(value, "^pdf");
  });
  for (const [token, count] of words.tokens)
    for (let index = 0; index < count; index++) tokenizer.add(token, "", false);
  for (const warning of words.warnings) tokenizer.warnings.add(warning);
  if (!pdf.pages!.some((page) => page.trim()))
    tokenizer.add("^notext", "^pdf", false);
  for (const thumbnail of pdf.thumbnails!) {
    tokenizer.add(`^iha-${Number(thumbnail.hasAlpha)}`, "", false);
    collectGifPalette(Buffer.from(thumbnail.data, "base64"), 0, tokenizer);
  }
}
