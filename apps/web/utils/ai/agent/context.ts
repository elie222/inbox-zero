import type {
  EmailAccountWithAI,
  EmailAccountWithAIInsights,
} from "@/utils/llms/types";
import { getTodayForLLM, getUserInfoPrompt } from "@/utils/ai/helpers";
import { TargetGroupCardinality } from "@/generated/prisma/enums";
import type { AgentSystemData } from "@/utils/ai/agent/system-data";

export type AgentMode = "onboarding" | "chat" | "processing_email" | "test";

export async function buildAgentSystemPrompt({
  emailAccount,
  mode,
  systemData,
}: {
  emailAccount: EmailAccountWithAI & { name?: string | null };
  mode: AgentMode;
  systemData: AgentSystemData;
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
    ["send", "updateSettings"].includes(type),
  );

  const isGmail = emailAccount.account?.provider === "google";
  const filteredActionTypes = Array.from(allowedActionTypes).filter(
    (type) => !(type === "move" && isGmail),
  );

  const capabilities = formatCapabilities({
    allowedActionTypes: filteredActionTypes,
    allowedActionOptions,
  });

  const skillsList = skills.length
    ? skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")
    : "- None";

  const onboardingContext =
    mode === "onboarding" ? buildOnboardingContext(emailAccount) : "";
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

type EmailAccountWithOptionalInsights = EmailAccountWithAI &
  Partial<
    Pick<EmailAccountWithAIInsights, "behaviorProfile" | "personaAnalysis">
  >;

function buildOnboardingContext(
  emailAccount: EmailAccountWithOptionalInsights,
): string {
  const insights = formatBehaviorProfile(emailAccount.behaviorProfile);
  const persona = formatPersonaAnalysis(emailAccount.personaAnalysis);
  const defaults = getDefaultRuleSuggestions(emailAccount.behaviorProfile);

  const hasInsights = Boolean(insights);
  const hasPersona = Boolean(persona);
  const hasAnyInsights = hasInsights || hasPersona;

  return `## Onboarding Context
This is a personal, conversational onboarding. Think of it like a friendly sales call or concierge experience. Your goal is to make the user feel heard and understood before jumping into setup.

## Data we've gathered (DO NOT use silently - see guidelines below)
${hasAnyInsights ? "" : "No inbox analysis available yet."}
${hasInsights ? `Inbox stats:\n${insights}` : ""}
${hasPersona ? `\nPersona (from analyzing their emails):\n${persona}` : ""}

## Default Setup (for later)
Labels: ${defaults.labels.join(", ")}
Skip Inbox (labeled but stays out of inbox): ${defaults.autoArchive.join(", ")}

## Onboarding Flow
The first message (already sent) asked: "What do you do, and what brought you to Inbox Zero?"

**Phase 1: Get to know them (1-2 exchanges)**
- Listen to what they share about their role/situation
- Show you understand their pain point
- NEVER repeat a question the user has already answered (even partially)
- If they only answer part of a question, acknowledge what they shared and move forward - don't re-ask
- You can use searchEmails to understand their inbox better (e.g., find how many unread, newsletters, etc.)

**Using inbox data (be transparent):**
- Before referencing inbox data, disclose it: "I took a look at your inbox - [observations]. Does that sound right?"
- You can search their inbox to understand patterns and offer to help

**Phase 2: Offer to help clean up**
- If they have a lot of unread/old emails, offer to help: "I can help clean up some of this right now. Want me to archive old newsletters and marketing emails?"
- Use **bulkArchive** tool to clean up efficiently - it can archive thousands of emails from specific senders at once
- First use searchEmails to identify high-volume senders (newsletters, marketing), then bulkArchive those senders
- This is a powerful first experience - clearing thousands of emails in seconds shows immediate value

**Phase 3: Show the default setup**
- Say ONE short sentence like "Here's what I'd set up going forward:" then call **showSetupPreview**
- Just ask "Does this work for you?" after the table

**Phase 4: Ask about drafting**
- Ask: "Would you like me to draft replies for you in your voice? I can learn your writing style and suggest responses."
- This is optional but valuable

**Phase 5: Confirm and activate**
- Ask about senders they never want filtered (boss, important clients)
- Summarize the setup and ask the user to confirm
- Once confirmed, call **completeOnboarding** with enableDrafting/enableSend based on their preferences from Phase 4
- After completeOnboarding succeeds, let the user know the agent is active

CRITICAL GUIDELINES:
- Be warm and conversational, not robotic
- Short responses (2-3 sentences max)
- NEVER repeat the same question - if the user answered (even partially), acknowledge and move on
- Progress the conversation forward; don't loop on the same phase
- You CAN use searchEmails and modifyEmails to understand and clean up their inbox
- Use showSetupPreview to present labels visually
- Use completeOnboarding to save the final configuration and activate the agent`;
}

function buildProcessingEmailContext(): string {
  return `## Processing Email Mode
You are processing a newly received email. Decide if any actions should be taken using the allowed actions and targets only.

Guidelines:
- Use modifyEmails to archive, mark read, or label this email.
- Use draftReply to draft a response when appropriate.
- Do NOT invent actions or targets that are not in the allow list.
- If no action is needed, respond with "No action needed."`;
}

function formatBehaviorProfile(
  profile: EmailAccountWithAIInsights["behaviorProfile"] | undefined,
) {
  if (!profile || typeof profile !== "object") return null;
  const data = profile as Record<string, unknown>;

  const unread = formatCount(data.unreadCount, "unread");
  const inbox = formatCount(data.inboxCount, "inbox");
  const sent = formatCount(data.sentCount, "sent");
  const labels = formatCount(data.labelCount, "custom labels");
  const filters = formatCount(data.filtersCount, "filters");
  const forwarding = formatCount(
    data.forwardingAddressesCount,
    "forwarding addresses",
  );

  const emailClients =
    typeof data.emailClients === "object" && data.emailClients
      ? (data.emailClients as { primary?: string }).primary
      : null;

  const lines = [
    unread,
    inbox,
    sent,
    labels,
    filters,
    forwarding,
    emailClients ? `- Primary email client: ${emailClients}` : null,
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : null;
}

function formatPersonaAnalysis(
  personaAnalysis: EmailAccountWithAIInsights["personaAnalysis"] | undefined,
) {
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

function getDefaultRuleSuggestions(
  _profile: EmailAccountWithAIInsights["behaviorProfile"] | undefined,
) {
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

function formatCount(value: unknown, label: string) {
  if (typeof value !== "number") return null;
  return `- ${value} ${label}`;
}
