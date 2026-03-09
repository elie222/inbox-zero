"use client";

import { Suspense } from "react";
import { Container } from "@/components/Container";
import { MutedText } from "@/components/Typography";
import {
  AddToKnowledgeBase,
  BasicToolInfo,
  ForwardEmailResult,
  ManageInboxResult,
  ReadEmailResult,
  ReplyEmailResult,
  SearchInboxResult,
  SendEmailResult,
  type ThreadLookup,
  UpdateAbout,
} from "@/components/assistant-chat/tools";
import { ChatProvider } from "@/providers/ChatProvider";

export default function ToolsPage() {
  const assistantToolThreadLookup = getAssistantToolThreadLookup();

  return (
    <Container>
      <div className="space-y-8 py-8">
        <h1>Assistant Tools</h1>

        <div className="mt-4 space-y-4">
          <MutedText>Input states:</MutedText>
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

          <MutedText>Output states:</MutedText>
          <div className="space-y-4">
            <BasicToolInfo text="Loaded account overview" />
            <BasicToolInfo text="Loaded assistant capabilities" />
            <BasicToolInfo text="Updated settings (2 changes)" />
            <SearchInboxResult output={getAssistantSearchInboxOutput()} />
            <ReadEmailResult output={getAssistantReadEmailOutput()} />
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
                labelId: "label-newsletter",
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
            <BasicToolInfo text="Updated inbox features" />
            <Suspense
              fallback={<BasicToolInfo text="Loading email action states..." />}
            >
              <ChatProvider>
                <AssistantEmailActionStates />
              </ChatProvider>
            </Suspense>
            <BasicToolInfo text="Read rules and settings" />
            <BasicToolInfo text="Read learned patterns" />
            <UpdateAbout
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
            <BasicToolInfo text="Memory saved" />
            <BasicToolInfo text="Found 2 memories" />
          </div>
        </div>
      </div>
    </Container>
  );
}

function AssistantEmailActionStates() {
  return (
    <div className="space-y-4">
      <MutedText>Email action states:</MutedText>

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
        subject: "Daily summary",
        from: "Daily Updates <updates@example.com>",
        snippet: "Your summary is ready",
        date: "2026-01-12T09:00:00.000Z",
        isUnread: true,
      },
      {
        messageId: "message-2",
        subject: "Release notes",
        from: "Product Team <product@example.com>",
        snippet: "New changes shipped today",
        date: "2026-01-11T18:30:00.000Z",
        isUnread: false,
      },
      {
        messageId: "message-3",
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
