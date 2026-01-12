import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createPerplexity } from "@ai-sdk/perplexity";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { env } from "@/env";
import { getModel } from "@/utils/llms/model";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import { formatDateTimeInUserTimezone } from "@/utils/date";
import {
  getCachedResearch,
  setCachedResearch,
} from "@/utils/redis/research-cache";
import type { Logger } from "@/utils/logger";
import { Provider } from "@/utils/llms/config";
import { createMcpToolsForAgent } from "@/utils/ai/mcp/mcp-tools";

const MAX_AGENT_STEPS = 15;
const MAX_EMAILS_PER_GUEST = 10;
const MAX_MEETINGS_PER_GUEST = 10;
const MAX_DESCRIPTION_LENGTH = 500;

const guestBriefingSchema = z.object({
  name: z.string().describe("The guest's name"),
  email: z.string().describe("The guest's email address"),
  bullets: z
    .array(z.string())
    .describe("Brief bullet points about this guest (max 10 words each)"),
});

const briefingSchema = z.object({
  guests: z
    .array(guestBriefingSchema)
    .describe("Briefing information for each meeting guest"),
});
export type BriefingContent = z.infer<typeof briefingSchema>;

const AGENTIC_SYSTEM_PROMPT = `You are an AI assistant that prepares concise meeting briefings.

Your task is to prepare a briefing about the external guests the user is meeting with.

WORKFLOW:
1. Review the provided context (email history, past meetings) for each guest
2. If search tools are available, use them to research each guest's professional background
3. Once you have gathered all information, call finalizeBriefing

SEARCH TIPS (if search tools are available):
- Use the guest's email domain to identify their company (e.g., john@acme.com likely works at Acme)
- Include company name in searches to disambiguate common names
- Look for LinkedIn profiles, current role, and company info
- If results seem uncertain (common name, conflicting info), note that in the briefing
- You can try multiple search tools if one doesn't return good results

BRIEFING GUIDELINES:
- Keep it concise: <10 bullet points per guest, max 10 words per bullet
- Focus on what's helpful before the meeting: role, company, recent discussions, pending items
- Don't repeat meeting details (time, date, location) - the user already has those
- If a guest has no prior context and no search tools are available, note they are a new contact
- ONLY include information about the specific guests listed. Do NOT mention other attendees or colleagues.
- Note any uncertainty about identity (common names, conflicting info)

IMPORTANT: You MUST call finalizeBriefing when you are done to submit your briefing.`;

const searchInputSchema = z.object({
  query: z.string().describe("The search query"),
  email: z.string().describe("The guest's email address (used for caching)"),
  name: z.string().optional().describe("The guest's name if known"),
});

export async function aiGenerateMeetingBriefing({
  briefingData,
  emailAccount,
  logger,
}: {
  briefingData: MeetingBriefingData;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<BriefingContent> {
  if (briefingData.externalGuests.length === 0) {
    return { guests: [] };
  }

  // Build tools based on what's configured
  const { tools: searchTools, cleanup } = await buildSearchTools({
    emailAccount,
    logger,
  });

  if (Object.keys(searchTools).length === 0) {
    logger.info(
      "No search tools configured - will use existing email/meeting context only",
    );
  }

  const prompt = buildPrompt(briefingData, emailAccount);
  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    emailAccount,
    label: "Meeting Briefing",
    modelOptions,
  });

  let result: BriefingContent | null = null;

  try {
    await generateText({
      ...modelOptions,
      system: AGENTIC_SYSTEM_PROMPT,
      prompt,
      stopWhen: (stepResult) =>
        stepResult.steps.some((step) =>
          step.toolCalls?.some((call) => call.toolName === "finalizeBriefing"),
        ) || stepResult.steps.length > MAX_AGENT_STEPS,
      onStepFinish: async ({ toolCalls }) => {
        if (toolCalls.length > 0) {
          logger.info("Tool calls", {
            tools: toolCalls.map((call) => call.toolName),
          });
        }
      },
      tools: {
        ...searchTools,
        finalizeBriefing: tool({
          description:
            "Submit the final meeting briefing. Call this when you have gathered all information about all guests.",
          inputSchema: briefingSchema,
          execute: async (briefing) => {
            logger.info("Finalizing briefing", {
              guestCount: briefing.guests.length,
            });
            result = briefing;
            return { success: true };
          },
        }),
      },
    });
  } finally {
    await cleanup();
  }

  if (!result) {
    logger.warn(
      "Agent did not finalize briefing, generating fallback from guest list",
    );
    return generateFallbackBriefing(briefingData.externalGuests);
  }

  return result;
}

function generateFallbackBriefing(
  guests: { email: string; name?: string }[],
): BriefingContent {
  return {
    guests: guests.map((guest) => ({
      name: guest.name || guest.email.split("@")[0],
      email: guest.email,
      bullets: ["Research incomplete - meeting guest"],
    })),
  };
}

type SearchToolsResult = {
  tools: ToolSet;
  cleanup: () => Promise<void>;
};

async function buildSearchTools({
  emailAccount,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<SearchToolsResult> {
  const tools: ToolSet = {};
  let mcpCleanup: (() => Promise<void>) | null = null;

  // Perplexity search (if configured)
  if (env.PERPLEXITY_API_KEY) {
    tools.perplexitySearch = tool({
      description: "Search for information using Perplexity",
      inputSchema: searchInputSchema,
      execute: async ({ query, email, name }) => {
        logger.info("Perplexity search", { query, email, name });

        const cached = await getCachedResearch(
          emailAccount.userId,
          "perplexity",
          email,
          name,
        );
        if (cached) {
          logger.info("Using cached Perplexity result", { email });
          return cached;
        }

        try {
          const perplexity = createPerplexity({
            apiKey: env.PERPLEXITY_API_KEY,
          });

          const perplexityGenerateText = createGenerateText({
            emailAccount,
            label: "Perplexity Search",
            modelOptions: {
              modelName: "sonar-pro",
              model: perplexity("sonar-pro"),
              provider: "perplexity",
              backupModel: null,
            },
          });

          const searchResult = await perplexityGenerateText({
            model: perplexity("sonar-pro"),
            prompt: query,
          });

          const text = searchResult.text;

          setCachedResearch(
            emailAccount.userId,
            "perplexity",
            email,
            name,
            text,
          ).catch((error) => {
            logger.error("Failed to cache Perplexity result", { error });
          });

          return text;
        } catch (error) {
          logger.error("Perplexity search failed", { error, query });
          return "Search failed. Try another search tool.";
        }
      },
    });
  }

  // Web search (OpenAI, Google, or OpenRouter - if configured)
  const webSearchConfig = getWebSearchConfig();
  if (webSearchConfig) {
    tools.webSearch = createWebSearchTool({
      emailAccount,
      logger,
      providerName: webSearchConfig.providerName,
      getSearchTools: webSearchConfig.getSearchTools,
      useOnlineVariant: webSearchConfig.useOnlineVariant,
    });
  }

  // MCP tools (CRM, databases, etc.)
  try {
    const mcpResult = await createMcpToolsForAgent(emailAccount.id);
    mcpCleanup = mcpResult.cleanup; // Always assign cleanup to avoid connection leaks
    const mcpToolCount = Object.keys(mcpResult.tools).length;
    if (mcpToolCount > 0) {
      Object.assign(tools, mcpResult.tools);
      logger.info("MCP tools added for meeting briefs", {
        toolCount: mcpToolCount,
      });
    }
  } catch (error) {
    logger.warn("Failed to load MCP tools for meeting briefs", { error });
  }

  return {
    tools,
    cleanup: async () => {
      if (mcpCleanup) await mcpCleanup();
    },
  };
}

type WebSearchConfig = {
  providerName: string;
  useOnlineVariant: boolean;
  getSearchTools?: () => ToolSet;
};

function getWebSearchConfig(): WebSearchConfig | null {
  switch (env.DEFAULT_LLM_PROVIDER) {
    case Provider.OPEN_AI:
      return {
        providerName: "OpenAI",
        useOnlineVariant: false,
        getSearchTools: () => ({ web_search: openai.tools.webSearch({}) }),
      };
    case Provider.GOOGLE:
      return {
        providerName: "Google",
        useOnlineVariant: false,
        getSearchTools: () => ({
          google_search: google.tools.googleSearch({}),
        }),
      };
    case Provider.OPENROUTER:
      return {
        providerName: "OpenRouter",
        useOnlineVariant: true,
      };
    default:
      return null;
  }
}

function createWebSearchTool({
  emailAccount,
  logger,
  providerName,
  getSearchTools,
  useOnlineVariant,
}: {
  emailAccount: EmailAccountWithAI;
  logger: Logger;
  providerName: string;
  getSearchTools?: () => ToolSet;
  useOnlineVariant: boolean;
}) {
  return tool({
    description: "Search the web for information",
    inputSchema: searchInputSchema,
    execute: async ({ query, email, name }) => {
      logger.info(`Web search (${providerName})`, { query, email, name });

      const cached = await getCachedResearch(
        emailAccount.userId,
        "websearch",
        email,
        name,
      );
      if (cached) {
        logger.info("Using cached web search result", { email });
        return cached;
      }

      try {
        const modelOptions = getModel(
          emailAccount.user,
          "economy",
          useOnlineVariant,
        );

        const webGenerateText = createGenerateText({
          emailAccount,
          label: "Web Search",
          modelOptions,
        });

        const searchResult = await webGenerateText({
          model: modelOptions.model,
          prompt: query,
          ...(getSearchTools && { tools: getSearchTools() }),
        });

        const text = searchResult.text;

        setCachedResearch(
          emailAccount.userId,
          "websearch",
          email,
          name,
          text,
        ).catch((error) => {
          logger.error("Failed to cache web search result", { error });
        });

        return text;
      } catch (error) {
        logger.error("Web search failed", { error, query });
        return "Search failed. Try another search tool.";
      }
    },
  });
}

// Exported for testing
export function buildPrompt(
  briefingData: MeetingBriefingData,
  emailAccount: EmailAccountWithAI,
): string {
  const { event, externalGuests, emailThreads, pastMeetings } = briefingData;

  const allMessages = emailThreads.flatMap((t) => t.messages);

  const guestContexts: GuestContextForPrompt[] = externalGuests.map(
    (guest) => ({
      email: guest.email,
      name: guest.name,
      recentEmails: selectRecentEmailsForGuest(allMessages, guest.email),
      recentMeetings: selectRecentMeetingsForGuest(pastMeetings, guest.email),
      timezone: emailAccount.timezone,
    }),
  );

  // List available search tools for the prompt
  const availableTools: string[] = [];
  if (env.PERPLEXITY_API_KEY) availableTools.push("perplexitySearch");
  if (
    env.DEFAULT_LLM_PROVIDER === Provider.OPEN_AI ||
    env.DEFAULT_LLM_PROVIDER === Provider.GOOGLE ||
    env.DEFAULT_LLM_PROVIDER === Provider.OPENROUTER
  ) {
    availableTools.push("webSearch");
  }

  const toolsNote =
    availableTools.length > 0
      ? `\nAvailable search tools: ${availableTools.join(", ")}`
      : "";

  const prompt = `Prepare a concise briefing for this upcoming meeting.

${getUserInfoPrompt({ emailAccount })}

<upcoming_meeting>
Title: ${event.title}
${event.description ? `Description: ${event.description}` : ""}
</upcoming_meeting>

<guest_context>
${guestContexts.map((guest) => formatGuestContext(guest)).join("\n")}
</guest_context>
${toolsNote}

For each guest listed above:
1. Review their email and meeting history provided
2. Use search tools to find their professional background
3. Once you have all information, call finalizeBriefing with the complete briefing`;

  return prompt;
}

type GuestContextForPrompt = {
  email: string;
  name?: string;
  recentEmails: ParsedMessage[];
  recentMeetings: CalendarEvent[];
  timezone: string | null;
};

function formatGuestContext(guest: GuestContextForPrompt): string {
  const hasEmails = guest.recentEmails.length > 0;
  const hasMeetings = guest.recentMeetings.length > 0;

  const guestHeader = `${guest.name ? `Name: ${guest.name}\n` : ""}Email: ${guest.email}`;

  if (!hasEmails && !hasMeetings) {
    return `<guest>
${guestHeader}

<no_prior_context>This appears to be a new contact with no prior email or meeting history. Use search tools to find information about them.</no_prior_context>
</guest>
`;
  }

  const sections: string[] = [];

  if (hasEmails) {
    sections.push(`<recent_emails>
${guest.recentEmails
  .map(
    (email) =>
      `<email>\n${stringifyEmailSimple(getEmailForLLM(email))}\n</email>`,
  )
  .join("\n")}
</recent_emails>`);
  }

  if (hasMeetings) {
    sections.push(`<recent_meetings>
${guest.recentMeetings.map((meeting) => formatMeetingForContext(meeting, guest.timezone)).join("\n")}
</recent_meetings>`);
  }

  return `<guest>
${guestHeader}

${sections.join("\n")}
</guest>
`;
}

function selectRecentMeetingsForGuest(
  pastMeetings: CalendarEvent[],
  guestEmail: string,
): CalendarEvent[] {
  const email = guestEmail.toLowerCase();

  return pastMeetings
    .filter((m) => m.attendees.some((a) => a.email.toLowerCase() === email))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, MAX_MEETINGS_PER_GUEST);
}

function selectRecentEmailsForGuest(
  messages: ParsedMessage[],
  guestEmail: string,
): ParsedMessage[] {
  const email = guestEmail.toLowerCase();

  return messages
    .filter((m) => messageIncludesEmail(m, email))
    .sort((a, b) => getMessageTimestampMs(b) - getMessageTimestampMs(a))
    .slice(0, MAX_EMAILS_PER_GUEST);
}

function messageIncludesEmail(
  message: ParsedMessage,
  emailLower: string,
): boolean {
  const headers = message.headers;
  return (
    headers.from.toLowerCase().includes(emailLower) ||
    headers.to.toLowerCase().includes(emailLower) ||
    (headers.cc?.toLowerCase().includes(emailLower) ?? false) ||
    (headers.bcc?.toLowerCase().includes(emailLower) ?? false)
  );
}

function getMessageTimestampMs(message: ParsedMessage): number {
  const internal = message.internalDate;
  if (internal && /^\d+$/.test(internal)) {
    const ms = Number(internal);
    return Number.isFinite(ms) ? ms : 0;
  }

  const parsed = Date.parse(message.date);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Exported for testing
export function formatMeetingForContext(
  meeting: CalendarEvent,
  timezone: string | null,
): string {
  const dateStr = formatDateTimeInUserTimezone(meeting.startTime, timezone);
  return `<meeting>
Title: ${meeting.title}
Date: ${dateStr}
${meeting.description ? `Description: ${meeting.description.slice(0, MAX_DESCRIPTION_LENGTH)}` : ""}
</meeting>
`;
}
