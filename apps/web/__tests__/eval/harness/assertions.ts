import { getCalendarBookingLinkForDraft } from "@/utils/ai/reply/draft-reply";
import type {
  DraftReplyAssertion,
  DraftReplyCase,
  DraftReplyContext,
  DraftReplyEmailAccountFixture,
} from "@/__tests__/eval/harness/draft-reply-schema";

export type AssertionOutcome = {
  name: string;
  pass: boolean;
  detail: string;
};

export type DraftOutput = {
  reply: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

export function runDraftReplyAssertions({
  assertions,
  output,
  input,
}: {
  assertions: DraftReplyAssertion[];
  output: DraftOutput;
  input: DraftReplyCase["input"];
}): AssertionOutcome[] {
  return assertions.map((assertion) =>
    runAssertion({ assertion, output, input }),
  );
}

function runAssertion({
  assertion,
  output,
  input,
}: {
  assertion: DraftReplyAssertion;
  output: DraftOutput;
  input: DraftReplyCase["input"];
}): AssertionOutcome {
  const reply = output.reply;

  switch (assertion.type) {
    case "replyContainsUrl":
      return replyContainsUrl(reply, assertion.url);
    case "replyOmitsUrl":
      return replyOmitsUrl(reply, assertion.url);
    case "replyOmitsBookingLink":
      return replyOmitsBookingLink(reply, input.emailAccount);
    case "replyOmitsCalendarSlotTimes":
      return replyOmitsCalendarSlotTimes(reply, input.context);
    case "replyOmitsEmDash":
      return replyOmitsEmDash(reply);
    case "replyIsNonEmpty":
      return replyIsNonEmpty(reply);
    case "confidenceIn":
      return confidenceIn(output.confidence, assertion.values);
    case "replyParagraphCountAtMost":
      return replyParagraphCountAtMost(reply, assertion.max);
    case "replyWordCountAtMost":
      return replyWordCountAtMost(reply, assertion.max);
    case "replyAddressesAllAsks":
      return replyAddressesAllAsks(reply, assertion.asks);
  }
}

function replyContainsUrl(reply: string, url: string): AssertionOutcome {
  const pass = normalize(reply).includes(normalizeUrl(url));
  return {
    name: "replyContainsUrl",
    pass,
    detail: pass ? `contains ${url}` : `missing ${url}`,
  };
}

function replyOmitsUrl(reply: string, url: string): AssertionOutcome {
  const pass = !normalize(reply).includes(normalizeUrl(url));
  return {
    name: "replyOmitsUrl",
    pass,
    detail: pass ? `omits ${url}` : `contains forbidden ${url}`,
  };
}

/**
 * Resolves the link through the product's own precedence rule rather than a
 * literal URL from the case file, so the check cannot go quietly vacuous when a
 * case declares both a native and an external booking link.
 */
function replyOmitsBookingLink(
  reply: string,
  emailAccount: DraftReplyEmailAccountFixture,
): AssertionOutcome {
  const bookingLink = getCalendarBookingLinkForDraft({
    bookingLinks: emailAccount.bookingLinks,
    calendarBookingLink: emailAccount.calendarBookingLink,
  });

  if (!bookingLink) {
    return {
      name: "replyOmitsBookingLink",
      pass: true,
      detail: "account has no booking link",
    };
  }

  const pass = !normalize(reply).includes(normalizeUrl(bookingLink));
  return {
    name: "replyOmitsBookingLink",
    pass,
    detail: pass
      ? `omits ${bookingLink}`
      : `contains the user's booking link ${bookingLink}`,
  };
}

function replyOmitsCalendarSlotTimes(
  reply: string,
  context: DraftReplyContext,
): AssertionOutcome {
  const slotFragments = (context.calendarAvailability?.suggestedTimes ?? [])
    .flatMap((slot) => [slot.start, slot.end])
    .flatMap(timeFragments);

  const leakedSlot = slotFragments.find((fragment) =>
    normalize(reply).includes(fragment),
  );
  const clockMatch = reply.match(CLOCK_TIME_PATTERN);
  const pass = !leakedSlot && !clockMatch;

  return {
    name: "replyOmitsCalendarSlotTimes",
    pass,
    detail: pass
      ? "no specific times proposed"
      : `proposes a specific time: ${leakedSlot ?? clockMatch?.[0]}`,
  };
}

function replyOmitsEmDash(reply: string): AssertionOutcome {
  const pass = !reply.includes("—");
  return {
    name: "replyOmitsEmDash",
    pass,
    detail: pass ? "no em dash" : "contains an em dash",
  };
}

function replyIsNonEmpty(reply: string): AssertionOutcome {
  const pass = reply.trim().length > 0;
  return {
    name: "replyIsNonEmpty",
    pass,
    detail: pass ? `${reply.trim().length} chars` : "empty reply",
  };
}

function confidenceIn(
  confidence: DraftOutput["confidence"],
  values: DraftOutput["confidence"][],
): AssertionOutcome {
  const pass = values.includes(confidence);
  return {
    name: "confidenceIn",
    pass,
    detail: `confidence=${confidence}, allowed=${values.join("|")}`,
  };
}

function replyParagraphCountAtMost(
  reply: string,
  max: number,
): AssertionOutcome {
  const count = countParagraphs(reply);
  return {
    name: "replyParagraphCountAtMost",
    pass: count <= max,
    detail: `${count} paragraphs, max ${max}`,
  };
}

function replyWordCountAtMost(reply: string, max: number): AssertionOutcome {
  const count = countWords(reply);
  return {
    name: "replyWordCountAtMost",
    pass: count <= max,
    detail: `${count} words, max ${max}`,
  };
}

function replyAddressesAllAsks(
  reply: string,
  asks: { id: string; description: string; matchAny: string[] }[],
): AssertionOutcome {
  const normalized = normalize(reply);
  const missed = asks.filter(
    (ask) =>
      !ask.matchAny.some((fragment) =>
        normalized.includes(fragment.toLowerCase()),
      ),
  );

  return {
    name: "replyAddressesAllAsks",
    pass: missed.length === 0,
    detail:
      missed.length === 0
        ? `addressed ${asks.length}/${asks.length} asks`
        : `missed ${missed.length}/${asks.length}: ${missed.map((ask) => ask.id).join(", ")}`,
  };
}

const CLOCK_TIME_PATTERN =
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b(?:1[0-2]|0?\d)\s?(?:a\.?m\.?|p\.?m\.?)\b/i;

function timeFragments(slot: string): string[] {
  const match = slot.match(/(\d{1,2}):(\d{2})/);
  if (!match) return [slot.toLowerCase()];
  const [, hour = "", minute = ""] = match;
  const hour24 = Number(hour);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? "am" : "pm";
  return [
    `${hour24}:${minute}`,
    `${hour12}:${minute}`,
    `${hour12}${suffix}`,
    `${hour12} ${suffix}`,
  ];
}

function countParagraphs(reply: string): number {
  return reply
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;
}

function countWords(reply: string): number {
  return reply.trim().split(/\s+/).filter(Boolean).length;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, "");
}
