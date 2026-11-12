import * as cheerio from "cheerio";
import * as he from "he";
import {
  buildSignedAssetProxyUrl,
  type AssetProxyRewriteOptions,
} from "@inboxzero/image-proxy/proxy-url";

const CSS_URL_PATTERN = /url\(\s*(['"]?)([^"')]+)\1\s*\)/gi;
const DOCUMENT_PATTERN = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i;
const SVG_URL_ATTRIBUTES = ["href", "xlink:href"] as const;
const SVG_URL_TAGS = ["feimage", "image", "use"] as const;
const URL_ATTRIBUTES = ["background", "poster", "src"] as const;

export async function rewriteHtmlRemoteAssetUrls(
  html: string,
  options: AssetProxyRewriteOptions,
): Promise<string> {
  if (!html) return html;

  const getSignedUrl = createSignedUrlMemo(options);
  const isDocument = DOCUMENT_PATTERN.test(html);
  const $ = cheerio.load(html, null, isDocument);
  let changed = false;

  await Promise.all([
    ...$("style")
      .toArray()
      .map(async (element) => {
        const css = $(element).html();
        if (typeof css !== "string") return;

        const rewrittenCss = await rewriteCssRemoteAssetUrls(css, getSignedUrl);
        if (rewrittenCss === css) return;

        $(element).html(rewrittenCss);
        changed = true;
      }),
    ...$("[style]")
      .toArray()
      .map(async (element) => {
        const styleValue = $(element).attr("style");
        if (typeof styleValue !== "string") return;

        const rewrittenStyle = await rewriteCssRemoteAssetUrls(
          styleValue,
          getSignedUrl,
        );
        if (rewrittenStyle === styleValue) return;

        $(element).attr("style", rewrittenStyle);
        changed = true;
      }),
    ...$("[srcset]")
      .toArray()
      .map(async (element) => {
        const srcsetValue = $(element).attr("srcset");
        if (typeof srcsetValue !== "string") return;

        const rewrittenSrcset = await rewriteSrcsetAttribute(
          srcsetValue,
          getSignedUrl,
        );
        if (rewrittenSrcset === srcsetValue) return;

        $(element).attr("srcset", rewrittenSrcset);
        changed = true;
      }),
    ...URL_ATTRIBUTES.flatMap((attribute) =>
      $(`[${attribute}]`)
        .toArray()
        .map(async (element) => {
          const attrValue = $(element).attr(attribute);
          if (typeof attrValue !== "string") return;

          const rewrittenValue = await rewriteAttributeUrl(
            attrValue,
            getSignedUrl,
          );
          if (rewrittenValue === attrValue) return;

          $(element).attr(attribute, rewrittenValue);
          changed = true;
        }),
    ),
    ...SVG_URL_TAGS.flatMap((tagName) =>
      $(tagName)
        .toArray()
        .flatMap((element) =>
          SVG_URL_ATTRIBUTES.map(async (attribute) => {
            const attrValue = $(element).attr(attribute);
            if (typeof attrValue !== "string") return;

            const rewrittenValue = await rewriteAttributeUrl(
              attrValue,
              getSignedUrl,
            );
            if (rewrittenValue === attrValue) return;

            $(element).attr(attribute, rewrittenValue);
            changed = true;
          }),
        ),
    ),
  ]);

  if (!changed) return html;

  return isDocument ? $.html() : ($.root().html() ?? html);
}

export async function rewriteCssRemoteAssetUrls(
  css: string,
  getSignedUrl:
    | ((assetUrl: string) => Promise<string>)
    | AssetProxyRewriteOptions,
): Promise<string> {
  if (!css) return css;

  const resolveSignedUrl =
    typeof getSignedUrl === "function"
      ? getSignedUrl
      : createSignedUrlMemo(getSignedUrl);

  return replaceAsync(css, CSS_URL_PATTERN, async (match, quote, rawUrl) => {
    const signedUrl = await resolveSignedUrl(decodeHtmlValue(rawUrl.trim()));
    if (signedUrl === rawUrl.trim()) return match;

    const wrappedUrl = quote ? signedUrl : escapeCssUrl(signedUrl);
    return `url(${quote || '"'}${wrappedUrl}${quote || '"'})`;
  });
}

function createSignedUrlMemo(options: AssetProxyRewriteOptions) {
  const cache = new Map<string, Promise<string>>();

  return async (assetUrl: string) => {
    const cachedUrl = cache.get(assetUrl);
    if (cachedUrl) return cachedUrl;

    const signedUrlPromise = buildSignedAssetProxyUrl({
      assetUrl,
      proxyBaseUrl: options.proxyBaseUrl,
      signingSecret: options.signingSecret,
      ttlSeconds: options.ttlSeconds,
      now: options.now,
    });

    cache.set(assetUrl, signedUrlPromise);

    return signedUrlPromise;
  };
}

async function rewriteAttributeUrl(
  value: string,
  getSignedUrl: (assetUrl: string) => Promise<string>,
) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return value;

  const rewrittenValue = await getSignedUrl(trimmedValue);
  if (rewrittenValue === trimmedValue) return value;

  return preserveOuterWhitespace(value, rewrittenValue);
}

async function rewriteSrcsetAttribute(
  srcset: string,
  getSignedUrl: (assetUrl: string) => Promise<string>,
) {
  const candidates = parseSrcsetCandidates(srcset);

  const rewrittenCandidates = await Promise.all(
    candidates.map(async ({ url, descriptor }) => {
      const signedUrl = await getSignedUrl(url);
      return descriptor ? `${signedUrl} ${descriptor}` : signedUrl;
    }),
  );

  return rewrittenCandidates.join(", ");
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (...match: string[]) => Promise<string> | string,
) {
  const globalPattern = pattern.global
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);

  const matches = [...input.matchAll(globalPattern)];
  if (matches.length === 0) return input;

  const replacements = await Promise.all(matches.map((m) => replacer(...m)));

  const segments: string[] = [];
  let lastIndex = 0;

  for (let i = 0; i < matches.length; i++) {
    const index = matches[i].index ?? 0;
    segments.push(input.slice(lastIndex, index));
    segments.push(replacements[i]);
    lastIndex = index + matches[i][0].length;
  }

  segments.push(input.slice(lastIndex));

  return segments.join("");
}

/**
 * Splits a srcset the way browsers do (HTML "parse a srcset attribute"): a
 * candidate's URL is the run of non-whitespace that starts it, minus trailing
 * commas, so commas inside a URL stay and a descriptor-less candidate still
 * ends at its comma. Any other split would leave a URL the browser loads
 * without the proxy.
 */
function parseSrcsetCandidates(srcset: string) {
  const candidates: { url: string; descriptor: string }[] = [];
  let index = 0;
  while (index < srcset.length) {
    while (
      index < srcset.length &&
      (srcset[index] === "," || isAsciiWhitespace(srcset[index]))
    )
      index += 1;
    const urlStart = index;
    while (index < srcset.length && !isAsciiWhitespace(srcset[index]))
      index += 1;
    const rawUrl = srcset.slice(urlStart, index);
    // A `/,+$/` regex backtracks quadratically on long comma runs.
    let urlEnd = rawUrl.length;
    while (urlEnd > 0 && rawUrl[urlEnd - 1] === ",") urlEnd -= 1;
    const url = rawUrl.slice(0, urlEnd);
    let descriptor = "";
    if (url === rawUrl) {
      const descriptorStart = index;
      // The spec's parentheses state does not nest: the first ")" ends it.
      let inParens = false;
      while (index < srcset.length) {
        const character = srcset[index];
        if (character === "(") inParens = true;
        else if (character === ")") inParens = false;
        else if (character === "," && !inParens) break;
        index += 1;
      }
      descriptor = srcset.slice(descriptorStart, index).trim();
      index += 1;
    }
    if (url) candidates.push({ url, descriptor });
  }
  return candidates;
}

// Srcset splits on ASCII whitespace only; any other space is part of the URL.
function isAsciiWhitespace(character: string) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\f" ||
    character === "\r"
  );
}

function decodeHtmlValue(value: string) {
  return he.decode(value, { isAttributeValue: true });
}

function escapeCssUrl(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function preserveOuterWhitespace(value: string, replacement: string) {
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? "";

  return `${leadingWhitespace}${replacement}${trailingWhitespace}`;
}
