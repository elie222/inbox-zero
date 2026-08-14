import { Output } from "ai";
import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createGenerateText } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { getWebSearchConfigForProvider } from "@/utils/ai/web-search";
import {
  isSafeForSharedCache,
  type PublicContactContext,
  publicContactContextSchema,
} from "@/utils/ai/public-contact-context-schema";
import { extractDomainFromEmail, isPublicEmailDomain } from "@/utils/email";
import { escapeHtml } from "@/utils/string";
import {
  acquirePublicContactResearchLock,
  getCachedPublicContactContext,
  releasePublicContactResearchLock,
  setCachedPublicContactContext,
  setCachedPublicContactContextNotFound,
} from "@/utils/redis/public-contact-context-cache";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ai/public-contact-context");

const publicIdentitySchema = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120).optional(),
});

const publicContactResearchSchema = z.strictObject({
  context: publicContactContextSchema
    .nullable()
    .describe(
      "The sourced public professional profile, or null when the sender cannot be identified confidently from public sources",
    ),
});

export type PublicContactContextResult =
  | { status: "found"; context: PublicContactContext }
  | {
      status: "unavailable";
      reason:
        | "personal_email"
        | "search_unavailable"
        | "research_in_progress"
        | "not_found";
    };

export type PublicContactContextUnavailableReason = Extract<
  PublicContactContextResult,
  { status: "unavailable" }
>["reason"];

export async function getPublicContactContext({
  email,
  name,
  emailAccount,
}: {
  email: string;
  name?: string;
  emailAccount: EmailAccountWithAI;
}): Promise<PublicContactContextResult> {
  const identity = publicIdentitySchema.safeParse({ email, name });
  if (!identity.success) {
    return { status: "unavailable", reason: "not_found" };
  }

  const domain = extractDomainFromEmail(identity.data.email);
  if (!domain) return { status: "unavailable", reason: "not_found" };
  if (isPublicEmailDomain(domain)) {
    return { status: "unavailable", reason: "personal_email" };
  }

  const cached = await getCachedPublicContactContext(identity.data.email);
  const cachedResult = getResultFromCache(cached);
  if (cachedResult) return cachedResult;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.MeetingWebSearch,
  );
  const webSearch = getWebSearchConfigForProvider(modelOptions.provider);
  if (!webSearch) {
    return { status: "unavailable", reason: "search_unavailable" };
  }

  const researchLock = await acquirePublicContactResearchLock(
    identity.data.email,
  );
  if (!researchLock.acquired) {
    return { status: "unavailable", reason: "research_in_progress" };
  }

  try {
    const cachedAfterLock = await getCachedPublicContactContext(
      identity.data.email,
    );
    const cachedAfterLockResult = getResultFromCache(cachedAfterLock);
    if (cachedAfterLockResult) return cachedAfterLockResult;

    const searchModelOptions = {
      ...modelOptions,
      fallbackModels: modelOptions.fallbackModels.filter(
        (fallback) => fallback.provider === modelOptions.provider,
      ),
    };
    const generateText = createGenerateText({
      emailAccount,
      label: "Public contact research",
      modelOptions: searchModelOptions,
      promptHardening: { trust: "untrusted", level: "full" },
    });
    const result = await generateText({
      model: searchModelOptions.model,
      system: `Research public professional information about an email sender.

Use web search before answering. Return only facts supported by public web pages.
Never use or return email contents, the Inbox Zero user's identity, relationship or communication history, private contact details, home addresses, family details, protected traits, personal social accounts, or unsupported inferences.
The work email is supplied only to identify and disambiguate the professional. Do not include any email address in the output.
If the sender cannot be matched confidently to public professional sources, return null context. Otherwise omit uncertain optional fields and use low confidence for a possible match.
Return JSON matching the provided schema, including direct public source URLs.`,
      prompt: `<public_identity>
<name>${escapeHtml(identity.data.name || "Unknown")}</name>
<work_email>${escapeHtml(identity.data.email)}</work_email>
<company_domain>${escapeHtml(domain)}</company_domain>
</public_identity>`,
      tools: webSearch.tools,
      providerOptions: webSearch.providerOptions,
      toolChoice: webSearch.toolChoice,
      output: Output.object({
        schema: publicContactResearchSchema,
        name: "public_contact_research",
        description:
          "A public professional profile with sources, or null when no confident public match exists",
      }),
    });

    const context = result.output.context;
    if (!context) {
      await setCachedPublicContactContextNotFound(identity.data.email);
      return { status: "unavailable", reason: "not_found" };
    }
    if (!isSafeForSharedCache(context)) {
      logger.warn("Generated contact context was not safe to share");
      return { status: "unavailable", reason: "not_found" };
    }

    await setCachedPublicContactContext(identity.data.email, context);
    return { status: "found", context };
  } catch (error) {
    logger.error("Public contact research failed");
    logger.trace("Public contact research failure details", { error });
    return { status: "unavailable", reason: "search_unavailable" };
  } finally {
    await releasePublicContactResearchLock(
      identity.data.email,
      researchLock.lockToken,
    );
  }
}

function getResultFromCache(
  cached: Awaited<ReturnType<typeof getCachedPublicContactContext>>,
): PublicContactContextResult | null {
  if (!cached) return null;
  if (cached.status === "not_found") {
    return { status: "unavailable", reason: "not_found" };
  }
  return { status: "found", context: cached.context };
}
