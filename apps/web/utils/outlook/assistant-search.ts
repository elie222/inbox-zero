import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { extractErrorInfo, isRetryableError } from "@/utils/outlook/retry";
import {
  buildOutlookSearchFallbackQuery,
  getOutlookComparisonFilters,
  getStandaloneOutlookStateTerms,
  sanitizeKqlTextQuery,
  stripStandaloneOutlookStateTerms,
  stripOutlookComparisonFilters,
} from "@/utils/outlook/message";
import { resolveOutlookFolderId } from "@/utils/outlook/search-scope";

const OUTLOOK_EMPTY_PAGE_AUTOPAGINATION_LIMIT = 5;

type SearchMessagesResult = Awaited<
  ReturnType<EmailProvider["searchMessages"]>
>;

type OutlookReadState = "read" | "unread";

export async function runOutlookSearch({
  emailProvider,
  normalizedInput,
  limit,
  pageToken,
  logger,
}: {
  emailProvider: EmailProvider;
  normalizedInput: NormalizedOutlookSearchInput;
  limit: number;
  pageToken?: string | null;
  logger: Logger;
}): Promise<{
  result?: SearchMessagesResult;
  queryUsed: string;
  lastError?: unknown;
  failures: Array<{ query: string; error: unknown }>;
  exactCount?: number;
  countError?: string;
}> {
  const folderId = await resolveOutlookFolderId({
    emailProvider,
    folderName: normalizedInput.folderName,
  });
  const searchQueries: string[] = [];
  const searchQuerySet = new Set<string>();
  const addSearchQuery = (query: string | null | undefined) => {
    if (query == null) return false;

    const normalizedQuery = normalizeMicrosoftRetryQuery(query);
    const queryKey = normalizedQuery || "<empty>";
    if (searchQuerySet.has(queryKey)) return false;

    searchQueries.push(query);
    searchQuerySet.add(queryKey);
    return true;
  };

  addSearchQuery(normalizedInput.query);
  const fallbackQuery = buildOutlookSearchFallbackQuery(normalizedInput.query);
  addSearchQuery(fallbackQuery);

  let result: SearchMessagesResult | undefined;
  let executedQuery = normalizedInput.query;
  let lastError: unknown;
  const failures: Array<{ query: string; error: unknown }> = [];
  let retryGuidanceAdded = false;

  for (let i = 0; i < searchQueries.length; i++) {
    const candidateQuery = searchQueries[i];
    try {
      result = await emailProvider.searchMessages({
        query: candidateQuery,
        maxResults: limit,
        pageToken: pageToken ?? undefined,
        fromEmail: normalizedInput.fromEmail ?? undefined,
        readState: normalizedInput.readState ?? undefined,
        labelName: normalizedInput.categoryName ?? undefined,
        ...(folderId && { folderId }),
      });
      executedQuery = candidateQuery;
      break;
    } catch (error) {
      lastError = error;
      failures.push({ query: candidateQuery, error });

      if (i === searchQueries.length - 1 && !retryGuidanceAdded) {
        retryGuidanceAdded = true;
        const failureType = getMicrosoftSearchFailureType(
          failures.map(({ error }) => extractErrorInfo(error)),
        );
        const retryGuidance = getMicrosoftSearchRetryGuidance({
          query: normalizedInput.query,
          failureType,
          attemptedQueries: searchQueries,
        });
        addSearchQuery(retryGuidance.retryQueries[0]);
      }

      if (i === searchQueries.length - 1) break;

      logger.warn("Search query failed; retrying with Outlook fallback", {
        query: candidateQuery,
        fallbackQuery: searchQueries[i + 1],
        error,
      });
    }
  }

  const queryUsed = formatQueryWithFromEmail(
    executedQuery,
    normalizedInput.fromEmail,
  );

  if (!result) {
    return { queryUsed, lastError, failures };
  }

  result = await skipEmptyOutlookSearchPages({
    emailProvider,
    searchResult: result,
    query: executedQuery,
    limit,
    readState: normalizedInput.readState,
    categoryName: normalizedInput.categoryName,
    fromEmail: normalizedInput.fromEmail,
    folderId,
  });

  let countResult: { exactCount: number } | { countError: string } | undefined;
  if (
    !pageToken &&
    !normalizedInput.query &&
    !normalizedInput.fromEmail &&
    !normalizedInput.readState &&
    (folderId || normalizedInput.categoryName)
  ) {
    try {
      countResult = {
        exactCount: await emailProvider.countMessages({
          folderId,
          labelId: normalizedInput.categoryName ?? undefined,
        }),
      };
    } catch {
      // A count failure should not discard usable search results.
      countResult = { countError: "Exact message count unavailable" };
    }
  }

  return { result, queryUsed, failures, ...countResult };
}

async function skipEmptyOutlookSearchPages({
  emailProvider,
  searchResult,
  query,
  limit,
  readState,
  categoryName,
  fromEmail,
  folderId,
}: {
  emailProvider: EmailProvider;
  searchResult: SearchMessagesResult;
  query: string;
  limit: number;
  readState?: OutlookReadState | null;
  categoryName?: string | null;
  fromEmail?: string | null;
  folderId?: string;
}) {
  let result = searchResult;
  let emptyPageSkips = 0;

  while (
    result.messages.length === 0 &&
    result.nextPageToken &&
    emptyPageSkips < OUTLOOK_EMPTY_PAGE_AUTOPAGINATION_LIMIT
  ) {
    emptyPageSkips += 1;
    result = await emailProvider.searchMessages({
      query,
      maxResults: limit,
      pageToken: result.nextPageToken,
      fromEmail: fromEmail ?? undefined,
      readState: readState ?? undefined,
      labelName: categoryName ?? undefined,
      ...(folderId && { folderId }),
    });
  }

  return result;
}

type NormalizedOutlookSearchInput = {
  query: string;
  fromEmail?: string | null;
  readState?: OutlookReadState | null;
  categoryName?: string | null;
  folderName?: string | null;
};

export function normalizeOutlookSearchInput({
  query,
  fromEmail,
  readState,
  categoryName,
  folderName,
}: NormalizedOutlookSearchInput): NormalizedOutlookSearchInput {
  const normalizedQuery = query.trim();
  const inferredReadState =
    readState ?? inferOutlookReadStateFromQuery(normalizedQuery);
  const queryWithoutState = inferredReadState
    ? stripStandaloneOutlookStateTerms(normalizedQuery).trim()
    : normalizedQuery;
  const explicitFromEmail = fromEmail?.trim() || null;
  const queryFromEmail =
    getStandaloneSenderEmailFromOutlookQuery(queryWithoutState);
  if (
    explicitFromEmail &&
    queryFromEmail &&
    explicitFromEmail.toLowerCase() !== queryFromEmail.toLowerCase()
  ) {
    throw new Error("Sender filters conflict. Use one exact sender address.");
  }
  const effectiveFromEmail = explicitFromEmail ?? queryFromEmail;
  const scopeCandidate = getOutlookFieldScopeCandidate(queryWithoutState);
  if (scopeCandidate) {
    const explicitScope =
      scopeCandidate.field === "folder" ? folderName : categoryName;
    if (explicitScope && explicitScope !== scopeCandidate.name) {
      throw new Error(
        "Search scopes conflict. Use one folder and one category filter.",
      );
    }
  }

  return {
    query: scopeCandidate || queryFromEmail ? "" : queryWithoutState,
    fromEmail: effectiveFromEmail,
    readState: inferredReadState,
    categoryName:
      scopeCandidate?.field === "category" ? scopeCandidate.name : categoryName,
    folderName:
      scopeCandidate?.field === "folder" ? scopeCandidate.name : folderName,
  };
}

function getStandaloneSenderEmailFromOutlookQuery(query: string) {
  const match = query
    .trim()
    .match(/^from\s*:\s*["']?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})["']?$/i);
  return match?.[1] ?? null;
}

function formatQueryWithFromEmail(
  query: string,
  fromEmail: string | null | undefined,
) {
  if (!fromEmail) return query;
  if (!query.trim()) return `from:${fromEmail}`;
  return `from:${fromEmail} ${query}`;
}

function inferOutlookReadStateFromQuery(
  query: string,
): OutlookReadState | null {
  const stateTerms = new Set(getStandaloneOutlookStateTerms(query));
  if (stateTerms.size !== 1) return null;

  const [state] = Array.from(stateTerms);
  return state === "read" || state === "unread" ? state : null;
}

function getOutlookFieldScopeCandidate(query: string) {
  const normalizedQuery = query.trim();
  const colonIndex = normalizedQuery.indexOf(":");
  if (colonIndex === -1) return null;

  const field = normalizedQuery.slice(0, colonIndex).trim().toLowerCase();
  if (field !== "category" && field !== "folder") return null;

  const name = stripWrappingQuotes(normalizedQuery.slice(colonIndex + 1));
  return name ? { field, name } : null;
}

function stripWrappingQuotes(value: string) {
  const normalized = value.trim();
  const firstChar = normalized.at(0);
  const lastChar = normalized.at(-1);

  if (
    normalized.length >= 2 &&
    firstChar &&
    firstChar === lastChar &&
    (firstChar === '"' || firstChar === "'")
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

const MICROSOFT_SEARCH_FAILURE_MESSAGES = {
  rate_limited: {
    summary: "Outlook rate-limited the search request.",
    suggestedNextStep:
      "Wait briefly, then retry once with a simpler Outlook query if needed.",
  },
  provider_unavailable: {
    summary: "Outlook search failed before returning results.",
    suggestedNextStep:
      "Retry once after the provider recovers instead of reusing the same query immediately.",
  },
  query_failed: {
    summary: "Outlook did not return results for the attempted search query.",
    suggestedNextStep:
      "Retry with a simpler Outlook query such as one bare sender email, one keyword, or one simple subject: term.",
  },
} as const;

type MicrosoftSearchFailureType =
  keyof typeof MICROSOFT_SEARCH_FAILURE_MESSAGES;

export function buildMicrosoftSearchErrorResult({
  query,
  failures,
}: {
  query: string;
  failures: Array<{
    query: string;
    error: unknown;
  }>;
}) {
  const errorInfos = failures.map(({ error }) => extractErrorInfo(error));

  const attempts = failures.map(({ query }, i) => ({
    query,
    status: errorInfos[i].status,
    code: errorInfos[i].code,
    message: errorInfos[i].errorMessage || "Microsoft search request failed",
  }));

  const failureType = getMicrosoftSearchFailureType(errorInfos);
  const retryGuidance = getMicrosoftSearchRetryGuidance({
    query,
    failureType,
    attemptedQueries: attempts.map((attempt) => attempt.query),
  });

  return {
    queryUsed: query,
    error: "Failed to search inbox",
    provider: "microsoft" as const,
    microsoftSearchFeedback: {
      failureType,
      summary: getMicrosoftSearchFailureSummary(failureType, retryGuidance),
      suggestedNextStep: getMicrosoftSearchSuggestedNextStep(
        failureType,
        retryGuidance,
      ),
      fallbackAttempted: failures.length > 1,
      attempts,
      likelyCause: retryGuidance.likelyCause,
      removedTerms: retryGuidance.removedTerms,
      retryQueries: retryGuidance.retryQueries,
    },
  };
}

function getMicrosoftSearchFailureType(
  errorInfos: Array<ReturnType<typeof extractErrorInfo>>,
): MicrosoftSearchFailureType {
  if (errorInfos.some((errorInfo) => isRetryableError(errorInfo).isRateLimit)) {
    return "rate_limited";
  }

  if (
    errorInfos.some((errorInfo) => {
      const retryability = isRetryableError(errorInfo);
      return retryability.isServerError || retryability.retryable;
    })
  ) {
    return "provider_unavailable";
  }

  return "query_failed";
}

function getMicrosoftSearchFailureSummary(
  failureType: MicrosoftSearchFailureType,
  retryGuidance: ReturnType<typeof getMicrosoftSearchRetryGuidance>,
) {
  const baseSummary = MICROSOFT_SEARCH_FAILURE_MESSAGES[failureType].summary;
  if (
    failureType !== "query_failed" ||
    !retryGuidance.likelyCause ||
    retryGuidance.likelyCause === baseSummary
  ) {
    return baseSummary;
  }

  return `${baseSummary} ${retryGuidance.likelyCause}`;
}

function getMicrosoftSearchSuggestedNextStep(
  failureType: MicrosoftSearchFailureType,
  retryGuidance: ReturnType<typeof getMicrosoftSearchRetryGuidance>,
) {
  if (failureType !== "query_failed") {
    return MICROSOFT_SEARCH_FAILURE_MESSAGES[failureType].suggestedNextStep;
  }

  if (retryGuidance.retryQueries.length === 0) {
    return MICROSOFT_SEARCH_FAILURE_MESSAGES.query_failed.suggestedNextStep;
  }

  return `Retry with one simpler Outlook query. Start with ${JSON.stringify(
    retryGuidance.retryQueries[0],
  )} and keep it to a single clause.`;
}

function getMicrosoftSearchRetryGuidance({
  query,
  failureType,
  attemptedQueries,
}: {
  query: string;
  failureType: MicrosoftSearchFailureType;
  attemptedQueries: string[];
}) {
  if (failureType !== "query_failed") {
    return {
      likelyCause: undefined,
      removedTerms: [] as string[],
      retryQueries: [] as string[],
    };
  }

  const stateTerms = getStandaloneOutlookStateTerms(query);
  const comparisonTerms = getOutlookComparisonFilters(query);
  const senderEmails = extractEmailAddressesFromMicrosoftSearchQuery(query);
  const subjectTerms = extractMicrosoftSubjectTerms(query);
  const attemptedQuerySet = new Set(
    attemptedQueries.map((attempt) => normalizeMicrosoftRetryQuery(attempt)),
  );
  const retryQueries = [
    ...senderEmails,
    ...subjectTerms.map(formatMicrosoftSubjectRetryQuery),
    ...getMicrosoftKeywordRetryQueries(query),
  ].filter((candidate, index, candidates) => {
    const normalized = normalizeMicrosoftRetryQuery(candidate);

    return (
      normalized.length > 0 &&
      !attemptedQuerySet.has(normalized) &&
      candidates.findIndex(
        (queryCandidate) =>
          normalizeMicrosoftRetryQuery(queryCandidate) === normalized,
      ) === index
    );
  });

  return {
    likelyCause: getMicrosoftSearchLikelyCause({
      query,
      stateTerms,
      comparisonTerms,
      senderEmails,
      subjectTerms,
    }),
    removedTerms: [...new Set([...stateTerms, ...comparisonTerms])],
    retryQueries: retryQueries.slice(0, 3),
  };
}

function getMicrosoftSearchLikelyCause({
  query,
  stateTerms,
  comparisonTerms,
  senderEmails,
  subjectTerms,
}: {
  query: string;
  stateTerms: string[];
  comparisonTerms: string[];
  senderEmails: string[];
  subjectTerms: string[];
}) {
  if (comparisonTerms.length > 0) {
    return "The failed query used comparison filters, which Outlook search often rejects.";
  }

  if (
    stateTerms.length > 0 &&
    (senderEmails.length > 0 || subjectTerms.length > 0)
  ) {
    return "The failed query mixed a read-state term with other filters. Retry with one simpler clause.";
  }

  if (senderEmails.length > 0 && subjectTerms.length > 0) {
    return "The failed query mixed sender and subject filters. Retry with one simpler clause.";
  }

  if (query.trim().split(/\s+/).length > 3) {
    return "The failed query was too complex for Outlook search. Retry with one simpler clause.";
  }

  return "Retry with one simpler Outlook clause at a time.";
}

function extractMicrosoftSubjectTerms(query: string) {
  return Array.from(
    query.matchAll(/\bsubject:(?:"([^"]+)"|(\S+))/gi),
    (match) => (match[1] ?? match[2] ?? "").trim(),
  ).filter(Boolean);
}

function formatMicrosoftSubjectRetryQuery(subject: string) {
  const escapedSubject = subject.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return subject.includes(" ")
    ? `subject:"${escapedSubject}"`
    : `subject:${escapedSubject}`;
}

function getMicrosoftKeywordRetryQueries(query: string) {
  const subjectTerms = extractMicrosoftSubjectTerms(query);
  if (subjectTerms.length > 0) {
    return subjectTerms.map((subject) => sanitizeKqlTextQuery(subject));
  }

  const cleanedQuery = stripOutlookComparisonFilters(
    stripStandaloneOutlookStateTerms(query),
  )
    .replace(/\bsubject:(?:"[^"]+"|\S+)/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanedQuery.length > 0 ? [cleanedQuery] : [];
}

function normalizeMicrosoftRetryQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractEmailAddressesFromMicrosoftSearchQuery(query: string) {
  return [
    ...new Set(query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
  ];
}
