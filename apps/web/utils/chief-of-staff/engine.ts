// apps/web/utils/chief-of-staff/engine.ts

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createChiefOfStaffTools } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import type {
  CosCategory,
  CosEngineResponse,
  AutonomyMode,
  EmailMetadata,
  Venture,
} from "./types";

type ToolContext = Parameters<typeof createChiefOfStaffTools>[0];

interface ProcessEmailParams {
  autonomyLevels: Record<CosCategory, AutonomyMode>;
  email: EmailMetadata;
  toolContext: ToolContext;
  venture: Venture;
  voiceTone: string;
}

function formatEmailForPrompt(email: EmailMetadata): string {
  return [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    `Date: ${email.date.toISOString()}`,
    `Thread ID: ${email.threadId}`,
    `Message ID: ${email.messageId}`,
    email.labels.length > 0 ? `Labels: ${email.labels.join(", ")}` : null,
    "",
    "--- Email Body ---",
    email.body || email.snippet,
    "",
    "--- Instructions ---",
    "Process this email according to your autonomy levels and tools. After taking any necessary actions, respond with a JSON object matching this exact schema:",
    "",
    "```json",
    JSON.stringify(
      {
        category:
          "one of: scheduling, scheduling_cancel, client_parent, business, urgent, notification, low_priority",
        summary: "1-2 sentence summary of what this email is about",
        actionTaken:
          "string describing action taken, or null if no action was taken",
        draft: {
          to: "recipient email",
          subject: "email subject",
          body: "email body html",
          gmailDraftId: "gmail draft id",
          gmailThreadId: "gmail thread id",
        },
        needsApproval:
          "boolean — true if autonomy mode is draft_approve or flag_only",
        conflicts: [
          {
            title: "event title",
            calendar: "calendar name",
            start: "ISO datetime",
            end: "ISO datetime",
          },
        ],
        isVip: "boolean",
        vipGroupName: "string or null",
      },
      null,
      2,
    ),
    "```",
    "",
    "Set draft to null if no draft was created. Set conflicts to [] if none. The JSON must be valid and complete.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function processEmailWithClaude(
  params: ProcessEmailParams,
): Promise<CosEngineResponse> {
  const { email, venture, voiceTone, autonomyLevels, toolContext } = params;

  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const model = anthropic("claude-sonnet-4-5-20250929");

  const systemPrompt = buildSystemPrompt({
    venture,
    voiceTone,
    autonomyLevels,
    currentDateTime: new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  });

  const tools = createChiefOfStaffTools(toolContext);

  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: formatEmailForPrompt(email),
      },
    ],
    tools,
    maxSteps: 10,
  });

  // Parse the JSON response from Claude
  // Claude is instructed to return a JSON object in its final message
  let parsed: CosEngineResponse;
  try {
    // Extract JSON from the response (may be wrapped in a code block)
    const jsonMatch =
      text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
      text.match(/(\{[\s\S]*\})/);

    const jsonString = jsonMatch ? jsonMatch[1] : text.trim();
    parsed = JSON.parse(jsonString) as CosEngineResponse;
  } catch (error) {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw response: ${text.slice(0, 500)}`,
    );
  }

  return parsed;
}
