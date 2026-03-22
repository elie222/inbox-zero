"use client";

import { Suspense } from "react";
import { Container } from "@/components/Container";
import { PageHeading, SectionHeader, MutedText } from "@/components/Typography";
import {
  AddToKnowledgeBase,
  BasicToolInfo,
  CreatedRuleToolCard,
  PendingCreateRulePreviewCard,
  UpdatedRuleConditions,
  UpdatedRuleActions,
  UpdatedLearnedPatterns,
  ForwardEmailResult,
  ManageInboxResult,
  ReadEmailResult,
  ReplyEmailResult,
  SearchInboxResult,
  SendEmailResult,
  type ThreadLookup,
  UpdatePersonalInstructions,
} from "@/components/assistant-chat/tools";
import { ActionType } from "@/generated/prisma/enums";
import { ChatProvider } from "@/providers/ChatProvider";

export default function ToolsPage() {
  const assistantToolThreadLookup = getAssistantToolThreadLookup();

  return (
    <Container>
      <div className="space-y-10 py-8">
        <PageHeading>Assistant Tools</PageHeading>

        {/* Rule Cards */}
        <section className="space-y-4">
          <SectionHeader>Rule Cards</SectionHeader>

          <MutedText>Created rules:</MutedText>
          <CreatedRuleToolCard
            preview
            args={{
              name: "Hiring",
              condition: {
                aiInstructions:
                  "Emails related to hiring, job applications, or candidate communication",
                static: null,
                conditionalOperator: null,
              },
              actions: [
                ruleAction(ActionType.FORWARD, { to: "jim@company.com" }),
                ruleAction(ActionType.LABEL, { label: "Recruiting" }),
              ],
            }}
          />
          <CreatedRuleToolCard
            preview
            args={{
              name: "Newsletter Archive",
              condition: {
                aiInstructions: "Newsletter and marketing emails",
                static: {
                  from: "newsletter@example.com",
                  to: null,
                  subject: null,
                },
                conditionalOperator: "OR",
              },
              actions: [
                ruleAction(ActionType.ARCHIVE),
                ruleAction(ActionType.LABEL, { label: "Newsletter" }),
                ruleAction(ActionType.MARK_READ),
              ],
            }}
          />
          <CreatedRuleToolCard
            preview
            args={{
              name: "Billing Alerts",
              condition: {
                aiInstructions: null,
                static: {
                  from: "billing@stripe.com",
                  to: null,
                  subject: "invoice",
                },
                conditionalOperator: null,
              },
              actions: [
                ruleAction(ActionType.LABEL, { label: "Billing" }),
                ruleAction(ActionType.FORWARD, {
                  to: "finance@company.com",
                }),
              ],
            }}
          />

          <MutedText>Pending confirmation:</MutedText>
          <PendingCreateRulePreviewCard
            args={{
              name: "AutoReply VIP",
              condition: {
                aiInstructions: null,
                static: {
                  from: "vip-client@example.com",
                  to: null,
                  subject: null,
                },
                conditionalOperator: null,
              },
              actions: [
                ruleAction(ActionType.REPLY, {
                  content:
                    "{{Draft a short reply that answers the sender and proposes a next step}}",
                }),
              ],
            }}
            riskMessages={[
              "High Risk: The AI can automatically generate and send any email content. A malicious actor could potentially trick the AI into generating unwanted or inappropriate content.",
            ]}
          />

          <MutedText>Updated conditions (no diff):</MutedText>
          <UpdatedRuleConditions
            preview
            ruleId="demo-rule"
            args={{
              ruleName: "Hiring",
              condition: {
                aiInstructions:
                  "Emails related to hiring, job applications, or candidate communication",
                static: { from: "hr@company.com", to: null, subject: null },
                conditionalOperator: "AND",
              },
            }}
            actions={[
              ruleAction(ActionType.FORWARD, { to: "jim@company.com" }),
              ruleAction(ActionType.LABEL, { label: "Recruiting" }),
            ]}
          />

          <MutedText>Updated conditions (with diff):</MutedText>
          <UpdatedRuleConditions
            preview
            ruleId="demo-rule"
            args={{
              ruleName: "Newsletter",
              condition: {
                aiInstructions:
                  "Emails that are newsletters, marketing, or promotional content",
                static: null,
                conditionalOperator: null,
              },
            }}
            actions={[
              ruleAction(ActionType.ARCHIVE),
              ruleAction(ActionType.LABEL, { label: "Newsletter" }),
              ruleAction(ActionType.MARK_READ),
            ]}
            originalConditions={{
              aiInstructions: "Emails that look like newsletters or marketing",
              conditionalOperator: null,
            }}
            updatedConditions={{
              aiInstructions:
                "Emails that are newsletters, marketing, or promotional content",
              conditionalOperator: null,
            }}
          />

          <MutedText>Updated actions:</MutedText>
          <UpdatedRuleActions
            preview
            ruleId="demo-rule"
            args={{
              ruleName: "Newsletter Archive",
              actions: [
                ruleAction(ActionType.ARCHIVE),
                ruleAction(ActionType.LABEL, { label: "Newsletter" }),
                ruleAction(ActionType.MARK_READ),
              ],
            }}
            condition={{
              aiInstructions: "Newsletter and marketing emails",
              static: {
                from: "newsletter@example.com",
              },
              conditionalOperator: "OR",
            }}
          />
          <UpdatedRuleActions
            preview
            ruleId="demo-rule"
            args={{
              ruleName: "Hiring",
              actions: [
                ruleAction(ActionType.FORWARD, { to: "jim@company.com" }),
                ruleAction(ActionType.LABEL, { label: "Recruiting" }),
              ],
            }}
            condition={{
              aiInstructions:
                "Emails related to hiring, job applications, or candidate communication",
            }}
            originalActions={[
              {
                type: ActionType.LABEL,
                fields: buildRuleActionFields({ label: "Recruiting" }),
              },
            ]}
            updatedActions={[
              {
                type: ActionType.FORWARD,
                fields: buildRuleActionFields({ to: "jim@company.com" }),
                delayInMinutes: null,
              },
              {
                type: ActionType.LABEL,
                fields: buildRuleActionFields({ label: "Recruiting" }),
                delayInMinutes: null,
              },
            ]}
          />

          <MutedText>Updated learned patterns:</MutedText>
          <UpdatedLearnedPatterns
            preview
            ruleId="demo-rule"
            args={{
              ruleName: "Newsletter",
              learnedPatterns: [
                {
                  include: {
                    from: "@substack.com",
                    subject: null,
                  },
                  exclude: null,
                },
                {
                  include: null,
                  exclude: {
                    from: "team@company.com",
                    subject: null,
                  },
                },
              ],
            }}
          />
        </section>

        {/* Email Actions */}
        <section className="space-y-4">
          <SectionHeader>Email Actions</SectionHeader>
          <Suspense
            fallback={<BasicToolInfo text="Loading email action states..." />}
          >
            <ChatProvider>
              <AssistantEmailActionStates />
            </ChatProvider>
          </Suspense>
        </section>

        {/* Search & Read Results */}
        <section className="space-y-4">
          <SectionHeader>Search & Read Results</SectionHeader>
          <SearchInboxResult output={getAssistantSearchInboxOutput()} />
          <ReadEmailResult output={getAssistantReadEmailOutput()} />
        </section>

        {/* Manage Inbox Results */}
        <section className="space-y-4">
          <SectionHeader>Manage Inbox Results</SectionHeader>
          <ManageInboxResult
            input={{
              action: "archive_threads",
              threadIds: ["thread-1", "thread-2"],
            }}
            output={{
              action: "archive_threads",
              requestedCount: 2,
              successCount: 2,
              failedCount: 0,
            }}
            threadIds={["thread-1", "thread-2"]}
            threadLookup={assistantToolThreadLookup}
          />
          <ManageInboxResult
            input={{
              action: "archive_threads",
              threadIds: ["thread-1", "thread-2", "thread-3"],
              label: "Newsletter",
            }}
            output={{
              action: "archive_threads",
              requestedCount: 3,
              successCount: 2,
              failedCount: 1,
              failedThreadIds: ["thread-3"],
            }}
            threadIds={["thread-1", "thread-2", "thread-3"]}
            threadLookup={assistantToolThreadLookup}
          />
          <ManageInboxResult
            input={{
              action: "mark_read_threads",
              threadIds: ["thread-1", "thread-3"],
              read: true,
            }}
            output={{
              action: "mark_read_threads",
              requestedCount: 2,
              successCount: 2,
              failedCount: 0,
            }}
            threadIds={["thread-1", "thread-3"]}
            threadLookup={assistantToolThreadLookup}
          />
          <ManageInboxResult
            input={{
              action: "mark_read_threads",
              threadIds: ["thread-2"],
              read: false,
            }}
            output={{
              action: "mark_read_threads",
              requestedCount: 1,
              successCount: 1,
              failedCount: 0,
            }}
            threadIds={["thread-2"]}
            threadLookup={assistantToolThreadLookup}
          />
          <ManageInboxResult
            input={{
              action: "bulk_archive_senders",
              fromEmails: ["updates@example.com", "news@example.com"],
            }}
            output={{
              action: "bulk_archive_senders",
              sendersCount: 2,
              senders: ["updates@example.com", "news@example.com"],
            }}
            threadLookup={assistantToolThreadLookup}
          />
          <ManageInboxResult
            input={{
              action: "unsubscribe_senders",
              fromEmails: ["updates@example.com", "deals@example.com"],
            }}
            output={{
              action: "unsubscribe_senders",
              sendersCount: 2,
              senders: ["updates@example.com", "deals@example.com"],
              successCount: 2,
              failedCount: 0,
            }}
            threadLookup={assistantToolThreadLookup}
          />
        </section>

        {/* Settings & Knowledge */}
        <section className="space-y-4">
          <SectionHeader>Settings & Knowledge</SectionHeader>
          <UpdatePersonalInstructions
            args={{
              about:
                "I prefer concise responses and want newsletters archived by default.",
              mode: "replace",
            }}
          />
          <Suspense>
            <AddToKnowledgeBase
              args={{
                title: "Escalation preference",
                content:
                  "Escalate billing emails quickly and keep status updates short.",
              }}
            />
          </Suspense>
        </section>

        {/* Basic Tool Info States */}
        <section className="space-y-4">
          <SectionHeader>Basic Tool Info States</SectionHeader>
          <MutedText>Input states (loading indicators):</MutedText>
          <div className="grid gap-2 md:grid-cols-2">
            <BasicToolInfo text="Loading account overview..." />
            <BasicToolInfo text="Loading assistant capabilities..." />
            <BasicToolInfo text="Updating settings..." />
            <BasicToolInfo text="Searching inbox..." />
            <BasicToolInfo text="Reading email..." />
            <BasicToolInfo text="Archiving emails..." />
            <BasicToolInfo text="Archiving and labeling emails..." />
            <BasicToolInfo text="Marking emails as read..." />
            <BasicToolInfo text="Marking emails as unread..." />
            <BasicToolInfo text="Bulk archiving by sender..." />
            <BasicToolInfo text="Unsubscribing senders..." />
            <BasicToolInfo text="Updating inbox features..." />
            <BasicToolInfo text="Preparing email..." />
            <BasicToolInfo text="Preparing reply..." />
            <BasicToolInfo text="Preparing forward..." />
            <BasicToolInfo text="Reading rules and settings..." />
            <BasicToolInfo text="Reading learned patterns..." />
            <BasicToolInfo text='Creating rule "Newsletters"...' />
            <BasicToolInfo text='Updating rule "Newsletters" conditions...' />
            <BasicToolInfo text='Updating rule "Newsletters" actions...' />
            <BasicToolInfo text='Updating learned patterns for rule "Newsletters"...' />
            <BasicToolInfo text="Updating about..." />
            <BasicToolInfo text="Adding to knowledge base..." />
            <BasicToolInfo text="Saving memory..." />
            <BasicToolInfo text="Searching memories..." />
          </div>

          <MutedText>Output states (completion messages):</MutedText>
          <div className="grid gap-2 md:grid-cols-2">
            <BasicToolInfo text="Loaded account overview" />
            <BasicToolInfo text="Loaded assistant capabilities" />
            <BasicToolInfo text="Updated settings (2 changes)" />
            <BasicToolInfo text="Updated inbox features" />
            <BasicToolInfo text="Read rules and settings" />
            <BasicToolInfo text="Read learned patterns" />
            <BasicToolInfo text="Memory saved" />
            <BasicToolInfo text="Found 2 memories" />
          </div>
        </section>
      </div>
    </Container>
  );
}

function AssistantEmailActionStates() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <MutedText>Send — pending</MutedText>
        <SendEmailResult
          output={getAssistantSendEmailOutput("pending")}
          chatMessageId="assistant-demo-send-pending"
          toolCallId="assistant-demo-send-pending"
          disableConfirm={true}
        />
      </div>

      <div className="space-y-3">
        <MutedText>Send — processing</MutedText>
        <SendEmailResult
          output={getAssistantSendEmailOutput("processing")}
          chatMessageId="assistant-demo-send-processing"
          toolCallId="assistant-demo-send-processing"
          disableConfirm={true}
        />
      </div>

      <div className="space-y-3">
        <MutedText>Send — confirmed</MutedText>
        <SendEmailResult
          output={getAssistantSendEmailOutput("confirmed")}
          chatMessageId="assistant-demo-send-confirmed"
          toolCallId="assistant-demo-send-confirmed"
          disableConfirm={true}
        />
      </div>

      <div className="space-y-3">
        <MutedText>Reply — pending</MutedText>
        <ReplyEmailResult
          output={getAssistantReplyEmailOutput("pending")}
          chatMessageId="assistant-demo-reply-pending"
          toolCallId="assistant-demo-reply-pending"
          disableConfirm={true}
        />
      </div>

      <div className="space-y-3">
        <MutedText>Reply — confirmed</MutedText>
        <ReplyEmailResult
          output={getAssistantReplyEmailOutput("confirmed")}
          chatMessageId="assistant-demo-reply-confirmed"
          toolCallId="assistant-demo-reply-confirmed"
          disableConfirm={true}
        />
      </div>

      <div className="space-y-3">
        <MutedText>Forward — pending</MutedText>
        <ForwardEmailResult
          output={getAssistantForwardEmailOutput("pending")}
          chatMessageId="assistant-demo-forward-pending"
          toolCallId="assistant-demo-forward-pending"
          disableConfirm={true}
        />
      </div>

      <div className="space-y-3">
        <MutedText>Forward — confirmed</MutedText>
        <ForwardEmailResult
          output={getAssistantForwardEmailOutput("confirmed")}
          chatMessageId="assistant-demo-forward-confirmed"
          toolCallId="assistant-demo-forward-confirmed"
          disableConfirm={true}
        />
      </div>
    </div>
  );
}

type EmailActionState = "pending" | "processing" | "confirmed";

function getAssistantToolThreadLookup(): ThreadLookup {
  return new Map([
    [
      "thread-1",
      {
        messageId: "msg-1",
        from: "Daily Updates <updates@example.com>",
        subject: "Daily summary",
        snippet: "Your summary is ready",
        date: "2026-03-09T10:00:00Z",
        isUnread: true,
      },
    ],
    [
      "thread-2",
      {
        messageId: "msg-2",
        from: "Product Team <product@example.com>",
        subject: "Release notes",
        snippet: "New changes shipped today",
        date: "2026-03-09T09:00:00Z",
        isUnread: false,
      },
    ],
    [
      "thread-3",
      {
        messageId: "msg-3",
        from: "Support <support@example.com>",
        subject: "Ticket follow-up",
        snippet: "Checking in on your request",
        date: "2026-03-08T15:00:00Z",
        isUnread: true,
      },
    ],
  ]);
}

function getAssistantSearchInboxOutput() {
  return {
    queryUsed: "newer_than:7d in:inbox",
    totalReturned: 3,
    nextPageToken: null,
    summary: {
      total: 3,
      unread: 2,
      byCategory: {
        update: 2,
        support: 1,
      },
    },
    messages: [
      {
        messageId: "message-1",
        threadId: "thread-1",
        subject: "Daily summary",
        from: "Daily Updates <updates@example.com>",
        snippet: "Your summary is ready",
        date: "2026-01-12T09:00:00.000Z",
        isUnread: true,
      },
      {
        messageId: "message-2",
        threadId: "thread-2",
        subject: "Release notes",
        from: "Product Team <product@example.com>",
        snippet: "New changes shipped today",
        date: "2026-01-11T18:30:00.000Z",
        isUnread: false,
      },
      {
        messageId: "message-3",
        threadId: "thread-3",
        subject: "Ticket follow-up",
        from: "Support <support@example.com>",
        snippet: "Checking in on your request",
        date: "2026-01-10T15:20:00.000Z",
        isUnread: true,
      },
    ],
  };
}

function getAssistantReadEmailOutput() {
  return {
    messageId: "message-3",
    threadId: "thread-3",
    from: "Support <support@example.com>",
    to: "you@example.com",
    subject: "Ticket follow-up",
    content:
      "Hi there,\n\nChecking in on your request. Let us know if you need anything else.\n\nBest,\nSupport Team",
    date: "2026-01-10T15:20:00.000Z",
    attachments: [{ filename: "follow-up.pdf" }],
  };
}

function getAssistantSendEmailOutput(state: EmailActionState) {
  return {
    success: true,
    actionType: "send_email" as const,
    requiresConfirmation: true,
    confirmationState: state,
    pendingAction: {
      to: "user@example.com",
      cc: "ops@example.com",
      bcc: null,
      subject: "Weekly update",
      messageHtml: "<p>Hi team,<br/>Here is this week's update.</p>",
      from: "Inbox Zero <assistant@example.com>",
    },
    ...(state === "confirmed"
      ? {
          confirmationResult: {
            actionType: "send_email",
            confirmedAt: "2026-01-12T10:35:00.000Z",
            messageId: "message-send-confirmed",
            threadId: "thread-send-confirmed",
            to: "user@example.com",
            subject: "Weekly update",
          },
        }
      : {}),
  };
}

function getAssistantReplyEmailOutput(state: EmailActionState) {
  return {
    success: true,
    actionType: "reply_email" as const,
    requiresConfirmation: true,
    confirmationState: state,
    pendingAction: {
      messageId: "message-3",
      content: "Thanks for the follow-up. This is resolved now.",
    },
    reference: {
      messageId: "message-3",
      threadId: "thread-3",
      from: "Support <support@example.com>",
      subject: "Ticket follow-up",
    },
    ...(state === "confirmed"
      ? {
          confirmationResult: {
            actionType: "reply_email",
            confirmedAt: "2026-01-12T11:05:00.000Z",
            messageId: "message-reply-confirmed",
            threadId: "thread-3",
            subject: "Re: Ticket follow-up",
          },
        }
      : {}),
  };
}

function getAssistantForwardEmailOutput(state: EmailActionState) {
  return {
    success: true,
    actionType: "forward_email" as const,
    requiresConfirmation: true,
    confirmationState: state,
    pendingAction: {
      messageId: "message-2",
      to: "finance@example.com",
      cc: null,
      bcc: null,
      content: "Forwarding this for visibility.",
    },
    reference: {
      messageId: "message-2",
      threadId: "thread-2",
      from: "Product Team <product@example.com>",
      subject: "Release notes",
    },
    ...(state === "confirmed"
      ? {
          confirmationResult: {
            actionType: "forward_email",
            confirmedAt: "2026-01-12T11:20:00.000Z",
            messageId: "message-forward-confirmed",
            threadId: "thread-forward-confirmed",
            to: "finance@example.com",
            subject: "Fwd: Release notes",
          },
        }
      : {}),
  };
}

type RuleActionFields = {
  label: string | null;
  content: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  webhookUrl: string | null;
};

type DemoRuleActionType =
  | typeof ActionType.ARCHIVE
  | typeof ActionType.LABEL
  | typeof ActionType.REPLY
  | typeof ActionType.SEND_EMAIL
  | typeof ActionType.FORWARD
  | typeof ActionType.DRAFT_EMAIL
  | typeof ActionType.MARK_SPAM
  | typeof ActionType.CALL_WEBHOOK
  | typeof ActionType.MARK_READ
  | typeof ActionType.DIGEST
  | typeof ActionType.MOVE_FOLDER;

type DemoRuleAction = {
  type: DemoRuleActionType;
  fields: RuleActionFields;
  delayInMinutes: number | null;
};

function ruleAction(
  type: DemoRuleActionType,
  fields?: Partial<RuleActionFields>,
): DemoRuleAction {
  return {
    type,
    fields: buildRuleActionFields(fields),
    delayInMinutes: null,
  };
}

function buildRuleActionFields(fields?: Partial<RuleActionFields>): RuleActionFields {
  return {
    label: fields?.label ?? null,
    content: fields?.content ?? null,
    to: fields?.to ?? null,
    cc: fields?.cc ?? null,
    bcc: fields?.bcc ?? null,
    subject: fields?.subject ?? null,
    webhookUrl: fields?.webhookUrl ?? null,
  };
}
