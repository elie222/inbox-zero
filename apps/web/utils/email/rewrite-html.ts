import he from "he";
import {
  buildSignedAssetProxyUrl,
  type AssetProxyRewriteOptions,
} from "@inboxzero/image-proxy/proxy-url";

const STYLE_ELEMENT_PATTERN = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const STYLE_ATTRIBUTE_PATTERN = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi;
const SRCSET_ATTRIBUTE_PATTERN = /\bsrcset\s*=\s*(["'])([\s\S]*?)\1/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^"')]+)\1\s*\)/gi;
const URL_ATTRIBUTES = ["background", "poster", "src"] as const;

const URL_ATTRIBUTE_PATTERNS = Object.fromEntries(
  URL_ATTRIBUTES.map((attr) => [
    attr,
    {
      quoted: new RegExp(`\\b${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "gi"),
      unquoted: new RegExp(`\\b${attr}\\s*=\\s*([^\\s"'>]+)`, "gi"),
    },
  ]),
) as Record<
  (typeof URL_ATTRIBUTES)[number],
  { quoted: RegExp; unquoted: RegExp }
>;

export async function rewriteHtmlRemoteAssetUrls(
  html: string,
  options: AssetProxyRewriteOptions,
): Promise<string> {
  if (!html) return html;

  const getSignedUrl = createSignedUrlMemo(options);

  let rewrittenHtml = await replaceAsync(
    html,
    STYLE_ELEMENT_PATTERN,
    async (_match, attributes, css) =>
      `<style${attributes}>${await rewriteCssRemoteAssetUrls(
        css,
        getSignedUrl,
      )}</style>`,
  );

  rewrittenHtml = await replaceAsync(
    rewrittenHtml,
    STYLE_ATTRIBUTE_PATTERN,
    async (_match, quote, styleValue) => {
      const rewrittenStyle = await rewriteCssRemoteAssetUrls(
        decodeHtmlValue(styleValue),
        getSignedUrl,
      );

      return `style=${quote}${escapeHtmlAttributeValue(
        rewrittenStyle,
      )}${quote}`;
    },
  );

  rewrittenHtml = await replaceAsync(
    rewrittenHtml,
    SRCSET_ATTRIBUTE_PATTERN,
    async (_match, quote, srcsetValue) => {
      const rewrittenSrcset = await rewriteSrcsetAttribute(
        decodeHtmlValue(srcsetValue),
        getSignedUrl,
      );

      return `srcset=${quote}${escapeHtmlAttributeValue(
        rewrittenSrcset,
      )}${quote}`;
    },
  );

  for (const attribute of URL_ATTRIBUTES) {
    rewrittenHtml = await rewriteUrlAttribute(
      rewrittenHtml,
      attribute,
      getSignedUrl,
    );
  }

  return rewrittenHtml;
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

async function rewriteUrlAttribute(
  html: string,
  attribute: (typeof URL_ATTRIBUTES)[number],
  getSignedUrl: (assetUrl: string) => Promise<string>,
) {
  const { quoted, unquoted } = URL_ATTRIBUTE_PATTERNS[attribute];

  const rewrittenQuotedHtml = await replaceAsync(
    html,
    quoted,
    async (match, quote, rawValue) => {
      const signedUrl = await getSignedUrl(decodeHtmlValue(rawValue.trim()));
      if (signedUrl === rawValue.trim()) return match;

      return `${attribute}=${quote}${escapeHtmlAttributeValue(
        signedUrl,
      )}${quote}`;
    },
  );

  return replaceAsync(
    rewrittenQuotedHtml,
    unquoted,
    async (match, rawValue) => {
      const signedUrl = await getSignedUrl(decodeHtmlValue(rawValue.trim()));
      if (signedUrl === rawValue.trim()) return match;

      return `${attribute}="${escapeHtmlAttributeValue(signedUrl)}"`;
    },
  );
}

async function rewriteSrcsetAttribute(
  srcset: string,
  getSignedUrl: (assetUrl: string) => Promise<string>,
) {
  const candidates = srcset
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  const rewrittenCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      const separatorIndex = candidate.search(/\s/);
      const rawUrl =
        separatorIndex === -1 ? candidate : candidate.slice(0, separatorIndex);
      const descriptor =
        separatorIndex === -1 ? "" : candidate.slice(separatorIndex);
      const signedUrl = await getSignedUrl(rawUrl);

      return `${signedUrl}${descriptor}`;
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

function decodeHtmlValue(value: string) {
  return he.decode(value, { isAttributeValue: true });
}

function escapeCssUrl(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeHtmlAttributeValue(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
