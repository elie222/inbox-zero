import { decode } from "he";
import config from "./token-config.json";
import { compilePattern } from "./pattern";
import { parseHtml } from "./html-parser";
import type { ParsedMessage } from "@/utils/types";

export const TOKENIZER_VERSION = "portable-1";
const wordPattern = compilePattern(config.WordRegex, true);
const urlWords = compilePattern(config.WordRegexDict["^URL"], true);
const stopwords = new Set(config.StopWordSet);
const abbreviations: Record<string, string> = config.LocationAbbreviationDict;
const stopPatterns = new Map(
  Object.entries(config.LocationStopWordRegexDict).map(([key, value]) => [
    key,
    compilePattern(value),
  ]),
);
const validTags = compilePattern(config.ValidTagRegex);
const skippedHeaders = compilePattern(config.SkippedHeaderRegex);
const skippedHeaderNames = compilePattern(config.SkippedHeaderNameRegex);
const chunkedHeaders = compilePattern(config.ChunkedHeaderRegex);
const tags: Record<string, Record<string, string | boolean>> = config.TagsDict;
const colors: Record<string, string> = config.ColorNamesDict;
const entities: Record<string, string> = config.EntityDict;
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const asianWords = new Intl.Segmenter("und", { granularity: "word" });
const longExempt = new Set([
  "received",
  "return-path",
  "in-reply-to",
  "x-mailgun-tag",
  "content-type",
  "content-id",
  "^url",
  "^img",
  "x-originatororg",
]);

export class SpamTokenizer {
  readonly tokens = new Map<string, number>();
  readonly warnings = new Set<string>();
  readonly version: string;
  private readonly segment?: (text: string) => string[] | undefined;

  constructor(
    version = TOKENIZER_VERSION,
    segment?: (text: string) => string[] | undefined,
  ) {
    this.version = version;
    this.segment = segment;
  }

  add(input: string, location = "", useStopwords = true) {
    const value = input.replace(/^\uFEFF+/u, "").normalize("NFC");
    if (!value || (useStopwords && this.isStopword(value, location))) return;
    const prefix = abbreviations[location.toLowerCase()];
    const token = prefix ? `${prefix}:${value}` : value;
    this.tokens.set(token, (this.tokens.get(token) ?? 0) + 1);
    if (this.tokens.size > 50_000)
      throw new Error("Message exceeds spam feature limit");
  }

  word(input: string, location = "") {
    let value = input;
    const original = value;
    if (!location || location === "^pdf" || location === "^pdfa")
      value = value.toLowerCase();
    if (!location && /^[a-zA-Z0-9]{1,2}$/u.test(value)) return;
    if (this.isStopword(value, location)) return;
    if (value.includes(".") && value.split("@").length === 2) {
      const [local, domain] = value.split("@");
      this.add(`${local}@`, location, false);
      this.add(`@${domain}`, location, false);
      return;
    }
    const characters = [...graphemes.segment(original)].map(
      (part) => part.segment,
    );
    if (characters.length >= 30 && !longExempt.has(location.toLowerCase())) {
      this.add(
        `^long-${characters[0]}-${Math.floor(characters.length / 10) * 10}`,
        location,
        false,
      );
      return;
    }
    if (characters.length >= 9 && location !== "^url" && location !== "^img") {
      let buffer = "";
      let previousUpper = true;
      let emitted = false;
      for (const char of characters) {
        const upper = char.toUpperCase() === char;
        if (upper && !previousUpper && char !== " " && buffer) {
          this.word(buffer, location);
          buffer = "";
          emitted = true;
        }
        previousUpper = upper;
        if (!["_", ".", "-"].includes(char)) buffer += char;
      }
      if (emitted && buffer) this.word(buffer, location);
    }
    this.add(value, location);
  }

  words(input: string, location = "") {
    let value = input;
    if ([...value].some((char) => (char.codePointAt(0) ?? 0) > 127)) {
      const latin = [...value].every(
        (char) => char.codePointAt(0)! <= 255 || /[‘’“”—–…€]/u.test(char),
      );
      this.add(latin ? "^macroman" : "^unicode", "", false);
      value = value
        .replace(/[‘“”—–…]/gu, " ")
        .replace(/’(?=\W)/gu, "")
        .replaceAll("’", "'")
        .normalize("NFD")
        .replace(/\p{Mark}/gu, "");
      if (
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(
          value,
        )
      )
        if (!this.segment) this.warnings.add("portable-language-segmentation");
    }
    if (!location)
      value = value.replace(/\r\n?/gu, "\n").replace(/^[^\s<>]{50,}$/gmu, "");
    value = value.replace(
      /(?:https?|ftp|mailto):(?:\/\/)[^\s\][<>'"|]+/giu,
      (url) => {
        this.url(url);
        return " ";
      },
    );
    if (location === "subject")
      for (const match of value.matchAll(/[\p{P}\p{S}]{2,}/gu))
        this.word(match[0], location);
    value = value.replace(/--+|\.\.+/gu, " ");
    value = value.replace(
      /(?:^|\s)([\p{Alphabetic}]([ *'_/`^.:+~-])(?:[\p{Alphabetic}]\2){1,15}[\p{Alphabetic}])(?= |\2|[\p{P}\p{S}])/gu,
      (_, word: string, delimiter: string) => {
        const joined = word.split(delimiter).join("");
        this.add(`^inter-${delimiter.codePointAt(0)}`, location, false);
        this.add(`^iw-${joined.toLowerCase()}`, location, false);
        return ` ${joined} `;
      },
    );
    if (["", "subject", "^a"].includes(location)) {
      const replaced = value.replace(
        /([\p{Alphabetic}\p{Decimal_Number}])(?:;|~|\\|`|\^|\*|:)([\p{Alphabetic}\p{Decimal_Number}])/gu,
        "$1$2",
      );
      if (replaced !== value) this.add("^i-semi", location, false);
      value = replaced;
    }
    value = value.replaceAll("|", "l");
    value = value.replace(
      /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu,
      (emoji) => {
        if ((emoji.codePointAt(0) ?? 0) > 255 || emoji.includes("\uFE0F"))
          this.add(emoji, location, false);
        return " ";
      },
    );
    for (const match of value.matchAll(wordPattern)) {
      const segmented = this.segment?.(match[0]);
      if (segmented) {
        for (const part of segmented) this.word(part, location);
        continue;
      }
      if (
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(
          match[0],
        )
      ) {
        for (const part of asianWords.segment(match[0]))
          if (part.isWordLike) this.word(part.segment, location);
      } else this.word(match[0], location);
    }
  }

  url(input: string, location = "^url") {
    if (input.startsWith("cid:")) {
      this.add("^cid", location, false);
      return;
    }
    let value: string;
    try {
      value = decodeURIComponent(input);
      if (value !== input) this.add("^encoded", location, false);
    } catch {
      value = input.replaceAll("%", "");
      this.add("^dfail", location, false);
    }
    value = value.replaceAll("\n", "");
    const parts = /^([^:]+):(?:\/\/)?(([^/:]*).*)/u.exec(value);
    if (parts) {
      this.add(`^scheme-${parts[1]}`, location);
      if (value.includes("?")) this.add(`^?-${parts[1]}`, location, false);
      value = parts[2];
      if (/:\d\d\d$/u.test(parts[3])) this.add("^port", location, false);
    } else this.add("^relative", location, false);
    value = value.replace(
      /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu,
      (emoji) => {
        if ((emoji.codePointAt(0) ?? 0) > 255 || emoji.includes("\uFE0F"))
          this.add(emoji, location, false);
        return " ";
      },
    );
    for (const match of value.matchAll(urlWords)) this.word(match[0], location);
  }

  html(input: string) {
    const parsed = parseHtml(input.replace(/^[^\s<>]{50,}$/gmu, ""));
    let body = "";
    let skip = "";
    let afterHtml = false;
    let title = false;
    let anchor = false;
    let anchorText = false;
    let style = false;
    let invisible = false;
    let divHidden = false;
    let spanHidden = false;
    let visible = false;
    const text = (value: string) => {
      if (style) {
        for (const match of value.matchAll(/\W(float|display)\W/giu))
          this.add(match[1].toLowerCase(), "^style");
        return;
      }
      if (invisible || divHidden || spanHidden) {
        this.add("^invisible", "", false);
        this.words(value, "^invisible");
        body += " ".repeat([...graphemes.segment(value)].length);
        return;
      }
      if (title) {
        this.words(value, "^title");
        body += " ";
        return;
      }
      if (anchor) {
        this.words(value, "^a");
        body += " ";
        anchorText = true;
        return;
      }
      body += value;
      if (value.trim()) visible = true;
      if (/^\s+[a-zA-Z$0-9]{1,2}\s+$/u.test(value))
        this.add(value.trim(), "^sls");
      else if (/^\s*[a-zA-Z$0-9]{1,2}\s*$/u.test(value))
        this.add(value.trim(), "^sl");
    };
    // Merge resolved entities before routing: inline entity boundaries do not split words.
    const merged: ReturnType<typeof parseHtml> = [];
    for (const [kind, value] of parsed) {
      if (kind === "T" || kind === "E" || kind === "#") {
        let resolved = String(value);
        if (kind === "E")
          resolved = entities[String(value)] ?? decode(`&${value};`);
        if (kind === "#") {
          resolved = String.fromCharCode(Number(value) & 0xff_ff);
          if (
            /\p{Alphabetic}/u.test(
              String.fromCodePoint(Math.min(Number(value), 0x10_ff_ff)),
            )
          ) {
            this.add("^ent", "", false);
            this.add(`^ent-${resolved}`, "", false);
          }
        }
        const previous = merged[merged.length - 1];
        if (previous?.[0] === "T") previous[1] = String(previous[1]) + resolved;
        else merged.push(["T", resolved]);
      } else merged.push([kind, value]);
    }
    for (const [kind, value] of merged) {
      if (afterHtml) {
        this.add("^after-html", "", false);
        continue;
      }
      if (skip) {
        if (kind === "</" && value === skip) skip = "";
        continue;
      }
      if (kind === "T") {
        text(String(value));
        continue;
      }
      if (kind === "<!--") {
        this.words(String(value), "^comment");
        continue;
      }
      if (kind === "<?") {
        this.add("^pi", "", false);
        continue;
      }
      if (kind === "*") {
        this.add("^error", "", false);
        continue;
      }
      if (kind === "</") {
        const name = String(value);
        if (!validTags.test(name)) {
          this.add("^fake-close", "", false);
          this.add(`^fake-close-${name[0]}`, "", false);
          this.add(`^html-</${name}>`, "", false);
        }
        if (name === "html") afterHtml = true;
        if (name === "a") {
          if (!anchorText) this.add("^empty", "^a", false);
          anchor = false;
        }
        if (name === "title") title = false;
        if (name === "style") style = false;
        if (name === "font") invisible = false;
        if (name === "div") divHidden = false;
        if (name === "span") spanHidden = false;
        if (tags[name]?.RC) body += tags[name].RC;
        continue;
      }
      if (kind !== "<") continue;
      const [name, attrs] = value as [string, Record<string, string>];
      const policy = tags[name] ?? {};
      if (!validTags.test(name)) {
        this.add("^fake-open", "", false);
        this.add(`^fake-open-${name[0]}`, "", false);
        this.add(`^html-<${name}>`, "", false);
        for (const [attribute, raw] of Object.entries(attrs)) {
          this.add(`^html-a-${name}-${attribute}`, "", false);
          this.add(
            `^html-v-${name}-${attribute}=${raw.replace(/[^\p{Alphabetic}\p{Decimal_Number}]/gu, "")}`,
            "",
            false,
          );
        }
      }
      if (policy.S) {
        skip = name;
        continue;
      }
      if (name === "a") {
        anchor = true;
        anchorText = false;
      }
      if (name === "title") title = true;
      if (name === "style") style = true;
      if (name === "img" && anchor) this.add("^img", "^a", false);
      if (policy.R) body += policy.R;
      if (policy.F) this.add(name, "^tag", false);
      for (const [attribute, raw] of Object.entries(attrs).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const type = policy[attribute];
        if (type === "u") {
          this.url(raw);
          if (name === "img") this.url(raw, "^img");
        } else if (type === "t") this.words(raw, "^tag");
        else if (type === "at") this.words(raw, "^at");
        else if (["fg", "bg", "bc"].includes(String(type))) {
          const color = raw.replace(/^#/u, "").toLowerCase();
          const normalized = colors[color] ?? color;
          this.add(`^${type}-${normalized}`, "", false);
          if (type === "fg" && /f.f.f./u.test(normalized)) invisible = true;
        } else if (type === "a") {
          const clean = raw
            .replace(/[^\p{Alphabetic}\p{Decimal_Number}]/gu, "")
            .slice(0, 40);
          this.add(`^a-${attribute}-${clean}`, "", false);
        }
        if (attribute === "style") {
          for (const match of raw.matchAll(
            /(float|display|visibility)\s*:/giu,
          )) {
            const property = match[0].split(":")[0].trim().toLowerCase();
            const marker = property === "visibility" ? "vh" : property;
            this.add(`^${marker}`, "", false);
            this.add(`^${marker}-${name}`, "", false);
          }
          const hidden =
            /(float\s*:\s*(?:left|right|inline)|display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(
              raw,
            );
          if (name === "div" && hidden) divHidden = true;
          if (name === "span" && hidden) spanHidden = true;
        }
      }
      if (name === "meta") {
        if (attrs["http-equiv"]?.toLowerCase() === "content-type") {
          const charset = /charset\s*=\s*["']?([^\s;"']+)/iu.exec(
            attrs.content ?? "",
          );
          if (charset) this.add(charset[1], "^meta");
        }
        if (attrs.name?.toLowerCase() === "generator")
          this.add(
            (attrs.content ?? "")
              .replace(/[^\p{Alphabetic}\p{Decimal_Number}]/gu, "")
              .slice(0, 70),
            "^meta",
          );
      }
    }
    this.words(body);
    if (!visible) this.add("^all-tags", "", false);
  }

  private isStopword(value: string, location: string) {
    if (
      (!location || location === "^pdf" || location === "^pdfa") &&
      stopwords.has(value)
    )
      return true;
    return stopPatterns.get(location.toLowerCase())?.test(value) ?? false;
  }
}

export function tokenizeMessage(
  message: ParsedMessage,
  tokenizer = new SpamTokenizer(),
) {
  for (const [rawName, raw] of Object.entries(message.headers)) {
    if (!raw) continue;
    const name = rawName.toLowerCase();
    if (name.length >= 51) {
      tokenizer.add("^long-header-name", "", false);
      continue;
    }
    if (raw.length >= 1501) {
      tokenizer.add("^long-header-body", "", false);
      continue;
    }
    if (!skippedHeaderNames.test(rawName)) tokenizer.add(name, "^header");
    if (skippedHeaders.test(name)) continue;
    if (chunkedHeaders.test(name)) {
      tokenizer.add(
        raw.replace(/[^\p{Alphabetic}\p{Decimal_Number}.]/gu, "").slice(0, 70),
        name,
      );
      continue;
    }
    if (name === "subject") {
      let subject = raw.replace(/^\[spam\]/iu, "");
      if (subject.includes("    ")) {
        tokenizer.add("^4spaces", name, false);
        subject = subject.replaceAll("    ", " ");
      }
      if (subject.length >= 71) tokenizer.add("^long-subject", name, false);
      if (!subject) tokenizer.add("^blank", name, false);
      tokenizer.words(subject, name);
    } else if (name === "message-id") {
      const host = /<[^@]+@([^>]+)>/u.exec(raw)?.[1];
      tokenizer.add(
        host?.includes(".") ? host : host ? "^bad-host" : "^no-host",
        name,
      );
    } else tokenizer.words(raw, name);
  }
  if (message.textHtml) tokenizer.html(message.textHtml);
  else {
    const body = message.textPlain ?? "";
    if (body.length <= 2) tokenizer.add("^blank", "", false);
    if (body.length <= 49) tokenizer.add("^small", "", false);
    tokenizer.words(body);
  }
  return tokenizer;
}
