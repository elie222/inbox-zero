import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getTodayForLLM, getUserInfoPrompt } from "@/utils/ai/helpers";
import { TargetGroupCardinality } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import { getInboxCount } from "@/utils/assess";
import prisma from "@/utils/prisma";

export type AgentMode = "onboarding" | "chat" | "processing_email" | "test";

export type AgentSystemData = {
  allowedActions: Array<{ actionType: string; resourceType: string | null }>;
  allowedActionOptions: Array<{
    actionType: string;
    name: string;
    targetGroup?: {
      name: string;
      cardinality: TargetGroupCardinality | null;
    } | null;
  }>;
  skills: Array<{ name: string; description: string }>;
  patterns: Array<{
    id: string;
    matcher: unknown;
    reason: string | null;
    actions: Array<{ actionType: string }>;
  }>;
};

export async function getAgentSystemData({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<AgentSystemData> {
  const [allowedActions, allowedActionOptions, skills, patterns] =
    await Promise.all([
      prisma.allowedAction.findMany({
        where: { emailAccountId, enabled: true },
        select: { actionType: true, resourceType: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.allowedActionOption.findMany({
        where: { emailAccountId },
        select: {
          actionType: true,
          name: true,
          targetGroup: {
            select: { name: true, cardinality: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.skill.findMany({
        where: { emailAccountId, enabled: true },
        select: { name: true, description: true },
        orderBy: { name: "asc" },
      }),
      prisma.learnedPattern.findMany({
        where: { emailAccountId, resourceType: "email" },
        select: {
          id: true,
          matcher: true,
          reason: true,
          actions: { select: { actionType: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  return {
    allowedActions,
    allowedActionOptions,
    skills,
    patterns,
  };
}

export type OnboardingData = {
  inboxCount: number;
  topSenders: { from: string; count: number }[];
  persona: string | null;
};

export async function fetchOnboardingData({
  emailProvider,
  personaAnalysis,
}: {
  emailProvider: EmailProvider;
  personaAnalysis: unknown;
}): Promise<OnboardingData> {
  const [inboxCount, recentMessages] = await Promise.all([
    getInboxCount(emailProvider),
    emailProvider.getInboxMessages(50).catch(() => []),
  ]);

  const senderCounts = new Map<string, number>();
  for (const msg of recentMessages) {
    const from = msg.headers.from;
    if (from) {
      senderCounts.set(from, (senderCounts.get(from) || 0) + 1);
    }
  }

  const topSenders = Array.from(senderCounts.entries())
    .map(([from, count]) => ({ from, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    inboxCount,
    topSenders,
    persona: formatPersonaAnalysis(personaAnalysis),
  };
}

export async function buildAgentSystemPrompt({
  emailAccount,
  mode,
  systemData,
  onboardingData,
}: {
  emailAccount: EmailAccountWithAI & { name?: string | null };
  mode: AgentMode;
  systemData: AgentSystemData;
  onboardingData?: OnboardingData;
}) {
  const { allowedActions, allowedActionOptions, skills } = systemData;

  const allowedActionTypes = new Set(
    allowedActions
      .filter(
        (action) =>
          action.resourceType === null || action.resourceType === "email",
      )
      .map((action) => action.actionType),
  );

  const approvalRequired = Array.from(allowedActionTypes).filter((type) =>
    ["send", "forward", "updateSettings"].includes(type),
  );

  const isGmail = emailAccount.account?.provider === "google";
  const filteredActionTypes = Array.from(allowedActionTypes).filter(
    (type) => !(type === "move" && isGmail),
  );

  const capabilities = formatCapabilities({
    allowedActionTypes: filteredActionTypes,
    allowedActionOptions,
  });

  const { patterns } = systemData;

  const skillsList = skills.length
    ? skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")
    : "- None";

  const patternsList = patterns.length
    ? patterns
        .map((p) => {
          const matcher = p.matcher as { field?: string; value?: string };
          const actions = p.actions.map((a) => a.actionType).join(", ");
          return `- ${matcher.field ?? "?"}="${matcher.value ?? "?"}" → ${actions} (id: ${p.id})`;
        })
        .join("\n")
    : "";

  const onboardingContext =
    mode === "onboarding" && onboardingData
      ? buildOnboardingContext(onboardingData)
      : "";
  const processingEmailContext =
    mode === "processing_email" ? buildProcessingEmailContext() : "";

  return `You are an AI assistant for Inbox Zero.

## What Inbox Zero Does
Inbox Zero is an AI assistant that processes incoming emails in the background. It can:
- Automatically label and categorize emails
- Auto-archive low-priority emails (they're labeled, just not in inbox)
- Draft replies for emails that need responses
- Track emails awaiting replies

## What Inbox Zero Does NOT Do
- Summarize emails or threads (we don't do this)
- Read emails aloud or provide real-time notifications
- Integrate with calendars or schedule meetings
- Any feature not explicitly listed above

IMPORTANT: Only describe features that are listed above. Do not make up or promise features that don't exist.

${getTodayForLLM()}

${getUserInfoPrompt({ emailAccount })}

${onboardingContext}
${processingEmailContext}

${
  mode === "onboarding"
    ? `## Your Capabilities (Onboarding)

Actions you CAN take right now:
- Search emails
- Bulk archive emails from specific senders (use bulkArchive tool)
- Show setup preview
- Complete onboarding setup`
    : `## Your Capabilities

Actions you CAN take:
${capabilities.allowedActions}

${
  approvalRequired.length
    ? `Actions that require approval:\n- ${approvalRequired.join("\n- ")}`
    : "Actions that require approval:\n- None"
}`
}

## Available Skills
${skillsList}
(Use getSkill to load full instructions. Only these skills exist.)
${
  patternsList
    ? `
## Learned Patterns
These patterns auto-execute on incoming emails without invoking the LLM:
${patternsList}
You can create new patterns with createPattern or remove them with removePattern.`
    : `
## Learned Patterns
No patterns yet. Use createPattern to create patterns for recurring emails you handle the same way.`
}

## Current Mode
${formatMode(mode)}`.trim();
}

function formatCapabilities({
  allowedActionTypes,
  allowedActionOptions,
}: {
  allowedActionTypes: string[];
  allowedActionOptions: Array<{
    actionType: string;
    name: string;
    targetGroup?: {
      name: string;
      cardinality: TargetGroupCardinality | null;
    } | null;
  }>;
}) {
  const lines: string[] = [];
  const typeSet = new Set(allowedActionTypes);

  lines.push("- Search emails");
  lines.push("- Read emails");

  if (typeSet.has("archive")) lines.push("- Archive emails");
  if (typeSet.has("markRead")) lines.push("- Mark emails as read");
  if (typeSet.has("draft")) lines.push("- Draft replies");
  if (typeSet.has("send")) lines.push("- Send emails");

  if (typeSet.has("classify")) {
    lines.push(
      formatTargets({
        label: "Label emails",
        actionType: "classify",
        allowedActionOptions,
      }),
    );
  }

  if (typeSet.has("move")) {
    lines.push(
      formatTargets({
        label: "Move emails to folders",
        actionType: "move",
        allowedActionOptions,
      }),
    );
  }

  const extraTypes = allowedActionTypes.filter(
    (type) =>
      !["archive", "markRead", "draft", "send", "classify", "move"].includes(
        type,
      ),
  );
  for (const type of extraTypes) {
    lines.push(`- ${type}`);
  }

  return { allowedActions: lines.join("\n") || "- None" };
}

function formatTargets({
  label,
  actionType,
  allowedActionOptions,
}: {
  label: string;
  actionType: string;
  allowedActionOptions: Array<{
    actionType: string;
    name: string;
    targetGroup?: {
      name: string;
      cardinality: TargetGroupCardinality | null;
    } | null;
  }>;
}) {
  const options = allowedActionOptions.filter(
    (option) => option.actionType === actionType,
  );

  if (!options.length) {
    return `- ${label} (no allowed targets configured)`;
  }

  const grouped = new Map<string, { cardinality: string; names: string[] }>();
  const ungrouped: string[] = [];

  for (const option of options) {
    if (!option.targetGroup) {
      ungrouped.push(option.name);
      continue;
    }

    const key = option.targetGroup.name;
    const current = grouped.get(key) ?? {
      cardinality:
        option.targetGroup.cardinality === TargetGroupCardinality.SINGLE
          ? "single-choice"
          : "multi-choice",
      names: [],
    };
    current.names.push(option.name);
    grouped.set(key, current);
  }

  const groupLines = Array.from(grouped.entries()).map(
    ([name, group]) =>
      `- ${name} (${group.cardinality}): ${group.names.join(", ")}`,
  );

  const ungroupedLine = ungrouped.length
    ? `${label} (targets: ${ungrouped.join(", ")})`
    : `${label} (targets configured via groups)`;

  if (groupLines.length) {
    return [`- ${ungroupedLine}`, ...groupLines.map((line) => `  ${line}`)]
      .join("\n")
      .trim();
  }

  return `- ${ungroupedLine}`;
}

function formatMode(mode: AgentMode) {
  switch (mode) {
    case "onboarding":
      return "Onboarding conversation";
    case "processing_email":
      return "Processing a specific email";
    case "test":
      return "Dry run / test mode";
    case "chat":
      return "General user chat";
  }
}

function buildOnboardingContext(data: OnboardingData): string {
  const defaults = getDefaultRuleSuggestions();
  const topSendersFormatted = data.topSenders
    .map((s) => `- ${s.from}: ${s.count} emails`)
    .join("\n");

  return `## Onboarding Context
This is a personal, conversational onboarding. Think of it like a friendly concierge experience. Your goal is to make the user feel heard and build trust before taking any action.

## Live inbox data (fetched just now)
- ${data.inboxCount} emails in inbox
${data.persona ? `\nPersona (from analyzing their emails):\n${data.persona}` : ""}
${data.topSenders.length > 0 ? `\nTop senders in inbox (by volume):\n${topSendersFormatted}` : "\nNo recent inbox messages found."}

## Default Setup
Labels: ${defaults.labels.join(", ")}
Skip Inbox (labeled but stays out of inbox): ${defaults.autoArchive.join(", ")}

## Onboarding Flow

**Opening message (you need to write this):**
The user's first message will be "__onboarding_start__" — this is an automatic trigger, not a real message. Respond with your opening greeting.
Use the data above to make it personal. Reference their role/industry if persona data is available, and mention their inbox size. For example: "Hey! I'm your inbox assistant. Looks like you're running product at a SaaS company — and I can see you've got about X emails sitting in your inbox. I'd love to help you get that under control."
Keep it to 2-3 sentences. Warm and conversational. End by asking what brought them to Inbox Zero.

**Phase 1: Connect and offer cleanup (same turn)**
- Acknowledge what they shared — show you understand their pain point
- You already have their top senders data above. Use it immediately — no need to call searchEmails. Identify the noisy senders (newsletters, marketing, notifications) and offer to archive them.
- Share what you found: "I took a look and found a lot of emails from [specific senders]. Want me to archive those?"
- If they say yes → use **bulkArchive** with the sender emails
- If they decline, that's fine — move to Phase 2

**Phase 2: Set up the assistant going forward**
- Transition naturally: "Now let's set up your assistant so things stay organized going forward."
- Call **showSetupPreview** to show the proposed labels and rules
- Mention that drafting is included: "I'll also draft replies in your voice when appropriate."
- Ask "Does this look good?"
- Once confirmed → call **completeOnboarding** with enableDrafting: true
- After completeOnboarding succeeds, let them know the agent is active

CRITICAL GUIDELINES:
- Be warm and conversational, not robotic
- Short responses (2-3 sentences max)
- Be proactive — use searchEmails freely to understand their inbox, don't ask permission
- Only ask permission before MODIFYING emails (archiving, labeling) — reading is always fine
- NEVER repeat the same question — if the user answered, acknowledge and move on
- Progress the conversation forward; don't loop on the same phase
- Use showSetupPreview to present labels visually
- Use completeOnboarding to save the final configuration and activate the agent
- Always call completeOnboarding with enableDrafting: true`;
}

function buildProcessingEmailContext(): string {
  return `## Processing Email Mode
You are processing a newly received email. Decide if any actions should be taken using the allowed actions and targets only.

Guidelines:
- Use modifyEmails to archive, mark read, or label this email.
- Use draftReply to draft a response when appropriate.
- Do NOT invent actions or targets that are not in the allow list.
- If you handle a recurring sender or subject the same way every time, use createPattern to automate it. Patterns bypass the LLM and execute instantly on future emails.
- If no action is needed, respond with "No action needed."`;
}

function formatPersonaAnalysis(personaAnalysis: unknown) {
  if (!personaAnalysis || typeof personaAnalysis !== "object") return null;
  const data = personaAnalysis as Record<string, unknown>;
  const persona = data.persona ? `Persona: ${data.persona}` : null;
  const industry = data.industry ? `Industry: ${data.industry}` : null;
  const level = data.positionLevel ? `Seniority: ${data.positionLevel}` : null;
  const responsibilities = Array.isArray(data.responsibilities)
    ? `Responsibilities: ${data.responsibilities.join(", ")}`
    : null;

  const lines = [persona, industry, level, responsibilities].filter(Boolean);
  return lines.length ? lines.map((line) => `- ${line}`).join("\n") : null;
}

function getDefaultRuleSuggestions() {
  return {
    labels: [
      "To Reply",
      "Awaiting Reply",
      "Actioned",
      "FYI",
      "Newsletter",
      "Calendar",
      "Receipt",
      "Notification",
    ],
    autoArchive: ["Marketing", "Cold Email"],
  };
}
