import he from "he";
import { escapeHtml } from "@/utils/string";

type RenderSafeLinksOptions = {
  allowHiddenLinks?: boolean;
};

type ExplicitLinkTarget =
  | { type: "domain"; value: string }
  | { type: "email"; value: string }
  | { type: "url"; value: string };

const HTML_ANCHOR_REGEX =
  /<a\s+[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const URL_REGEX = /\bhttps?:\/\/[^\s<>()]+/gi;
const SCHEMELESS_URL_REGEX =
  /\b(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}(?:(?::\d+)?(?:[/?#][^\s<>()]*)|:\d+)/gi;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const DOMAIN_REGEX =
  /\b(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}\b/gi;
const TRAILING_PUNCTUATION_REGEX = /[),.;:!?]+$/g;
const WHITESPACE_REGEX = /\s+/g;
const WWW_PREFIX_REGEX = /^www\./i;
const CRLF_REGEX = /\r\n/g;
const URL_SCHEME_PREFIX_REGEX = /^[A-Z][A-Z\d+.-]*:\/\//i;
const URL_SUFFIX_PREFIX_REGEX = /[/?#]/;
const EXPLICIT_PORT_SUFFIX_REGEX = /:\d+$/;

export function renderEmailTextWithSafeLinks(
  text: string,
  options: RenderSafeLinksOptions = {},
): string {
  const matches = findLinkMatches(text);
  if (!matches.length) return escapeTextSegment(text);

  const allowHiddenLinks = options.allowHiddenLinks ?? true;
  let result = "";
  let lastIndex = 0;

  for (const match of matches) {
    if (match.start < lastIndex) continue;

    result += escapeTextSegment(text.slice(lastIndex, match.start));

    const safeUrl = getSafeEmailLinkUrl(match.url);
    if (!safeUrl) {
      result += escapeTextSegment(match.raw);
      lastIndex = match.end;
      continue;
    }

    if (!allowHiddenLinks) {
      result += escapeHtml(getVisibleLinkText(safeUrl));
      lastIndex = match.end;
      continue;
    }

    const label = escapeHtml(formatLinkLabel(match.label, safeUrl));
    result += `<a href="${escapeHtml(safeUrl)}">${label}</a>`;
    lastIndex = match.end;
  }

  result += escapeTextSegment(text.slice(lastIndex));
  return result;
}

function findLinkMatches(text: string) {
  const matches = [
    ...findHtmlAnchorMatches(text),
    ...findMarkdownLinkMatches(text),
  ].sort((left, right) => left.start - right.start);

  return matches.filter((match, index) => {
    const previousMatch = matches[index - 1];
    return !previousMatch || match.start >= previousMatch.end;
  });
}

function findHtmlAnchorMatches(text: string) {
  const matches: Array<{
    end: number;
    label: string;
    raw: string;
    start: number;
    url: string;
  }> = [];

  HTML_ANCHOR_REGEX.lastIndex = 0;
  let match = HTML_ANCHOR_REGEX.exec(text);
  while (match) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      url: match[2] || "",
      label: decodeHtmlEntities(stripHtmlTags(match[3] || "")),
    });

    match = HTML_ANCHOR_REGEX.exec(text);
  }

  return matches;
}

function findMarkdownLinkMatches(text: string) {
  const matches: Array<{
    end: number;
    label: string;
    raw: string;
    start: number;
    url: string;
  }> = [];
  let index = 0;

  while (index < text.length) {
    const match = findNextMarkdownLinkMatch(text, index);
    if (!match) break;

    matches.push({
      start: match.start,
      end: match.end,
      raw: match.raw,
      url: match.url,
      label: match.label,
    });

    index = match.end;
  }

  return matches;
}

function formatLinkLabel(label: string, url: string) {
  const normalizedLabel = normalizeWhitespace(stripHtmlTags(label));

  if (!normalizedLabel) return getLinkDestinationLabel(url);

  // Only disclose the destination when the visible label explicitly names a
  // URL, domain, or email that does not match the actual target.
  const explicitTargets = extractExplicitLinkTargets(normalizedLabel);
  if (!explicitTargets.length) return normalizedLabel;
  if (explicitTargets.every((target) => doesTargetMatchUrl(target, url))) {
    return normalizedLabel;
  }

  const destinationLabel = getDisclosureDestinationLabel(url, explicitTargets);
  return `${normalizedLabel} - ${destinationLabel}`;
}

function getDisclosureDestinationLabel(
  url: string,
  explicitTargets: ExplicitLinkTarget[],
) {
  if (explicitTargets.some((target) => target.type === "url")) {
    return getVisibleLinkText(url);
  }

  return getLinkDestinationLabel(url);
}

function getVisibleLinkText(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "mailto:") {
    return getLinkDestinationLabel(url);
  }

  return url;
}

function getLinkDestinationLabel(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "mailto:") {
    return parsed.pathname || url;
  }

  return parsed.hostname.replace(WWW_PREFIX_REGEX, "");
}

function getSafeEmailLinkUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:" &&
      parsed.protocol !== "mailto:"
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function stripHtmlTags(value: string) {
  return value.replace(HTML_TAG_REGEX, " ");
}

function extractExplicitLinkTargets(value: string) {
  const targets: ExplicitLinkTarget[] = [];

  URL_REGEX.lastIndex = 0;
  const urlMatches = value.match(URL_REGEX) || [];
  for (const match of urlMatches) {
    targets.push({ type: "url", value: trimTrailingPunctuation(match) });
  }

  URL_REGEX.lastIndex = 0;
  const withoutUrls = value.replace(URL_REGEX, " ");

  EMAIL_REGEX.lastIndex = 0;
  const emailMatches = withoutUrls.match(EMAIL_REGEX) || [];
  for (const match of emailMatches) {
    targets.push({ type: "email", value: trimTrailingPunctuation(match) });
  }

  EMAIL_REGEX.lastIndex = 0;
  const withoutUrlsOrEmails = withoutUrls.replace(EMAIL_REGEX, " ");

  SCHEMELESS_URL_REGEX.lastIndex = 0;
  const schemeLessUrlMatches =
    withoutUrlsOrEmails.match(SCHEMELESS_URL_REGEX) || [];
  for (const match of schemeLessUrlMatches) {
    targets.push({ type: "url", value: trimTrailingPunctuation(match) });
  }

  SCHEMELESS_URL_REGEX.lastIndex = 0;
  const withoutExplicitUrls = withoutUrlsOrEmails.replace(
    SCHEMELESS_URL_REGEX,
    " ",
  );

  DOMAIN_REGEX.lastIndex = 0;
  const domainMatches = withoutExplicitUrls.match(DOMAIN_REGEX) || [];
  for (const match of domainMatches) {
    targets.push({ type: "domain", value: trimTrailingPunctuation(match) });
  }

  return targets;
}

function doesTargetMatchUrl(target: ExplicitLinkTarget, url: string) {
  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);

  switch (target.type) {
    case "url":
      return doesUrlTargetMatch(target.value, parsed);
    case "email":
      if (parsed.protocol !== "mailto:") return false;
      return target.value.toLowerCase() === parsed.pathname.toLowerCase();
    case "domain":
      return hostname === normalizeHostname(target.value);
  }
}

function doesUrlTargetMatch(targetUrl: string, destination: URL) {
  try {
    const parsedTarget = parseExplicitUrlTarget(targetUrl);

    if (parsedTarget.url.protocol === "mailto:") {
      return (
        destination.protocol === "mailto:" &&
        parsedTarget.url.pathname.toLowerCase() ===
          destination.pathname.toLowerCase()
      );
    }

    if (
      !doesUrlOriginMatch(parsedTarget.url, destination, {
        matchPort: parsedTarget.hasExplicitPort,
        matchProtocol: parsedTarget.hasExplicitScheme,
      })
    ) {
      return false;
    }
    if (!doesUrlLabelSpecifyPathOrQuery(targetUrl, parsedTarget.url)) {
      return true;
    }

    return (
      normalizeComparablePath(parsedTarget.url.pathname) ===
        normalizeComparablePath(destination.pathname) &&
      parsedTarget.url.search === destination.search &&
      (!doesUrlLabelSpecifyFragment(targetUrl) ||
        parsedTarget.url.hash === destination.hash)
    );
  } catch {
    return false;
  }
}

function doesUrlOriginMatch(
  left: URL,
  right: URL,
  options: { matchPort: boolean; matchProtocol: boolean },
) {
  return (
    (!options.matchProtocol || left.protocol === right.protocol) &&
    normalizeHostname(left.hostname) === normalizeHostname(right.hostname) &&
    (!(options.matchProtocol || options.matchPort) ||
      getComparablePort(left) === getComparablePort(right))
  );
}

function doesUrlLabelSpecifyPathOrQuery(rawTargetUrl: string, url: URL) {
  if (getRawTargetSuffix(rawTargetUrl)) return true;

  return normalizeComparablePath(url.pathname) !== "/" || Boolean(url.search);
}

function doesUrlLabelSpecifyFragment(rawTargetUrl: string) {
  return getRawTargetSuffix(rawTargetUrl).includes("#");
}

function getRawTargetSuffix(rawTargetUrl: string) {
  const withoutScheme = rawTargetUrl.replace(URL_SCHEME_PREFIX_REGEX, "");
  const suffixIndex = withoutScheme.search(URL_SUFFIX_PREFIX_REGEX);

  if (suffixIndex === -1) return "";
  return withoutScheme.slice(suffixIndex);
}

function parseExplicitUrlTarget(targetUrl: string) {
  const hasExplicitScheme = URL_SCHEME_PREFIX_REGEX.test(targetUrl);
  const hasExplicitPort = hasRawTargetPort(targetUrl);

  if (hasExplicitScheme) {
    return {
      hasExplicitPort,
      hasExplicitScheme,
      url: new URL(targetUrl),
    };
  }

  return {
    hasExplicitPort,
    hasExplicitScheme,
    url: new URL(`https://${targetUrl}`),
  };
}

function hasRawTargetPort(rawTargetUrl: string) {
  return EXPLICIT_PORT_SUFFIX_REGEX.test(getRawTargetAuthority(rawTargetUrl));
}

function getRawTargetAuthority(rawTargetUrl: string) {
  const withoutScheme = rawTargetUrl.replace(URL_SCHEME_PREFIX_REGEX, "");
  const pathOrQueryIndex = withoutScheme.search(URL_SUFFIX_PREFIX_REGEX);

  if (pathOrQueryIndex === -1) return withoutScheme;
  return withoutScheme.slice(0, pathOrQueryIndex);
}

function getComparablePort(url: URL) {
  if (url.port) return url.port;
  if (url.protocol === "http:") return "80";
  if (url.protocol === "https:") return "443";
  return "";
}

function normalizeComparablePath(pathname: string) {
  return pathname || "/";
}

function normalizeHostname(value: string) {
  return value.replace(WWW_PREFIX_REGEX, "").toLowerCase();
}

function trimTrailingPunctuation(value: string) {
  return value.replace(TRAILING_PUNCTUATION_REGEX, "");
}

function findNextMarkdownLinkMatch(text: string, startIndex: number) {
  for (let index = startIndex; index < text.length; index++) {
    if (text[index] !== "[") continue;

    const labelEnd = text.indexOf("](", index + 1);
    if (labelEnd === -1) return null;

    const label = text.slice(index + 1, labelEnd);
    if (!label || label.includes("[") || label.includes("]")) continue;

    const urlEnd = findMarkdownLinkUrlEnd(text, labelEnd + 2);
    if (urlEnd === -1) continue;

    return {
      start: index,
      end: urlEnd + 1,
      raw: text.slice(index, urlEnd + 1),
      url: text.slice(labelEnd + 2, urlEnd),
      label,
    };
  }

  return null;
}

function findMarkdownLinkUrlEnd(text: string, startIndex: number) {
  let depth = 0;

  for (let index = startIndex; index < text.length; index++) {
    const character = text[index];

    if (!character) break;
    if (
      character === " " ||
      character === "\t" ||
      character === "\n" ||
      character === "\r"
    )
      return -1;

    if (character === "(") {
      depth++;
      continue;
    }

    if (character !== ")") continue;

    if (depth === 0) return index;
    depth--;
  }

  return -1;
}

function decodeHtmlEntities(value: string) {
  return he.decode(value);
}

function normalizeWhitespace(value: string) {
  return value.replace(WHITESPACE_REGEX, " ").trim();
}

function escapeTextSegment(value: string) {
  return escapeHtml(value).replace(CRLF_REGEX, "\n");
}
