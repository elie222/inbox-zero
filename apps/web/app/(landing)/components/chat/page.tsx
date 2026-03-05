"use client";

import { Container } from "@/components/Container";
import { MutedText, TextLink } from "@/components/Typography";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Response } from "@/components/ai-elements/response";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Loader } from "@/components/ai-elements/loader";
import { PaperclipIcon, ImageIcon } from "lucide-react";

export default function ChatPage() {
  return (
    <Container>
      <div className="space-y-8 py-8">
        <h1>Chat Components</h1>

        <div>
          <TextLink href="/components">← All Components</TextLink>
        </div>

        {/* Messages */}
        <Section title="Messages (contained variant)">
          <ChatFrame>
            <Message from="user">
              <MessageContent variant="contained">
                Can you help me clean up my inbox?
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageContent variant="contained">
                <Response>
                  Sure! I can help you organize your inbox. Let me search for
                  emails that can be archived or categorized.
                </Response>
              </MessageContent>
            </Message>
            <Message from="user">
              <MessageContent variant="contained">
                Yes, please archive all newsletters from last month.
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        <Section title="Messages (flat variant)">
          <ChatFrame>
            <Message from="user">
              <MessageContent variant="flat">
                What rules do I have set up?
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageContent variant="flat">
                <Response>
                  {
                    "You have **3 active rules**:\n\n1. **Newsletter Handler** — Archives and labels newsletters\n2. **Important Emails** — Marks urgent emails from your team\n3. **Auto-Reply** — Sends a response when you're out of office"
                  }
                </Response>
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        {/* Reasoning */}
        <Section title="Reasoning (collapsed)">
          <ChatFrame>
            <Message from="assistant">
              <MessageContent variant="flat">
                <Reasoning duration={4}>
                  <ReasoningTrigger />
                  <ReasoningContent>
                    The user wants to clean up their inbox. I should search for
                    newsletters and promotional emails first, then suggest
                    archiving them in bulk. Let me also check if they have any
                    existing rules that might conflict.
                  </ReasoningContent>
                </Reasoning>
                <Response>
                  I found 47 newsletter emails from the past month. Would you
                  like me to archive all of them?
                </Response>
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        <Section title="Reasoning (expanded)">
          <ChatFrame>
            <Message from="assistant">
              <MessageContent variant="flat">
                <Reasoning duration={12} defaultOpen>
                  <ReasoningTrigger />
                  <ReasoningContent>
                    The user is asking about their email patterns. I need to
                    analyze their inbox to find recurring senders and categorize
                    them. Let me look at the top senders by volume and identify
                    newsletters, promotions, and important contacts. I should
                    also consider the frequency of emails from each sender.
                  </ReasoningContent>
                </Reasoning>
                <Response>
                  {
                    "Based on your inbox analysis, here are your top email categories:\n\n- **Newsletters**: 120 emails/month\n- **Notifications**: 85 emails/month\n- **Direct messages**: 45 emails/month"
                  }
                </Response>
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        {/* Tool Calls */}
        <Section title="Tool Call States">
          <div className="space-y-4">
            <MutedText>Pending (input streaming):</MutedText>
            <Tool>
              <ToolHeader
                title="search_inbox"
                type="tool-invocation"
                state="input-streaming"
              />
            </Tool>

            <MutedText>Running (input available):</MutedText>
            <Tool>
              <ToolHeader
                title="search_inbox"
                type="tool-invocation"
                state="input-available"
              />
              <ToolContent>
                <ToolInput
                  input={{
                    query: "newer_than:30d label:newsletter",
                    maxResults: 50,
                  }}
                />
              </ToolContent>
            </Tool>

            <MutedText>Approval requested:</MutedText>
            <Tool>
              <ToolHeader
                title="archive_emails"
                type="tool-invocation"
                state="approval-requested"
              />
              <ToolContent>
                <ToolInput
                  input={{
                    threadIds: ["thread-1", "thread-2", "thread-3"],
                    action: "archive",
                  }}
                />
              </ToolContent>
            </Tool>

            <MutedText>Completed:</MutedText>
            <Tool>
              <ToolHeader
                title="search_inbox"
                type="tool-invocation"
                state="output-available"
              />
              <ToolContent>
                <ToolInput
                  input={{
                    query: "newer_than:7d in:inbox",
                    maxResults: 10,
                  }}
                />
                <ToolOutput
                  output={{
                    totalResults: 3,
                    messages: [
                      {
                        from: "updates@github.com",
                        subject: "PR Review Requested",
                      },
                      {
                        from: "team@company.com",
                        subject: "Weekly Standup Notes",
                      },
                      {
                        from: "news@techcrunch.com",
                        subject: "Daily Digest",
                      },
                    ],
                  }}
                  errorText={undefined}
                />
              </ToolContent>
            </Tool>

            <MutedText>Error:</MutedText>
            <Tool>
              <ToolHeader
                title="send_email"
                type="tool-invocation"
                state="output-error"
              />
              <ToolContent>
                <ToolInput
                  input={{
                    to: "user@example.com",
                    subject: "Follow up",
                    body: "Hi, just following up on our conversation.",
                  }}
                />
                <ToolOutput
                  output={undefined}
                  errorText="Failed to send email: rate limit exceeded. Please try again later."
                />
              </ToolContent>
            </Tool>

            <MutedText>Denied:</MutedText>
            <Tool>
              <ToolHeader
                title="delete_emails"
                type="tool-invocation"
                state="output-denied"
              />
              <ToolContent>
                <ToolInput
                  input={{
                    threadIds: ["thread-1", "thread-2"],
                    permanent: true,
                  }}
                />
              </ToolContent>
            </Tool>
          </div>
        </Section>

        {/* Full conversation with tool call */}
        <Section title="Full Conversation with Tool Call">
          <ChatFrame>
            <Message from="user">
              <MessageContent variant="flat">
                Search my inbox for emails from GitHub this week.
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageContent variant="flat">
                <Tool>
                  <ToolHeader
                    title="search_inbox"
                    type="tool-invocation"
                    state="output-available"
                  />
                  <ToolContent>
                    <ToolInput
                      input={{
                        query: "from:github.com newer_than:7d",
                        maxResults: 20,
                      }}
                    />
                    <ToolOutput
                      output={{
                        totalResults: 5,
                        messages: [
                          {
                            from: "notifications@github.com",
                            subject: "PR #142 merged",
                          },
                          {
                            from: "notifications@github.com",
                            subject: "Issue #87 assigned to you",
                          },
                        ],
                      }}
                      errorText={undefined}
                    />
                  </ToolContent>
                </Tool>
                <Response>
                  {
                    "I found **5 emails** from GitHub this week. Here are the highlights:\n\n1. **PR #142 merged** — Your pull request was merged\n2. **Issue #87 assigned to you** — A new issue needs your attention\n\nWould you like me to do anything with these emails?"
                  }
                </Response>
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        {/* Conversation with reasoning + tool */}
        <Section title="Conversation with Reasoning + Tool Call">
          <ChatFrame>
            <Message from="user">
              <MessageContent variant="flat">
                Help me unsubscribe from newsletters I never read.
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageContent variant="flat">
                <Reasoning duration={6}>
                  <ReasoningTrigger />
                  <ReasoningContent>
                    The user wants to unsubscribe from newsletters they
                    don&apos;t read. I should first search for newsletter emails
                    and identify which ones have low engagement. I&apos;ll look
                    at open rates and which ones were archived without being
                    read.
                  </ReasoningContent>
                </Reasoning>
                <Tool>
                  <ToolHeader
                    title="search_inbox"
                    type="tool-invocation"
                    state="output-available"
                  />
                  <ToolContent>
                    <ToolInput
                      input={{
                        query: "label:newsletter is:unread older_than:30d",
                        maxResults: 100,
                      }}
                    />
                    <ToolOutput
                      output={{
                        totalResults: 23,
                        uniqueSenders: 8,
                        topUnreadSenders: [
                          {
                            sender: "marketing@store.com",
                            unreadCount: 12,
                          },
                          {
                            sender: "weekly@digest.io",
                            unreadCount: 8,
                          },
                          {
                            sender: "deals@shop.com",
                            unreadCount: 3,
                          },
                        ],
                      }}
                      errorText={undefined}
                    />
                  </ToolContent>
                </Tool>
                <Response>
                  {
                    "I found **23 unread newsletter emails** from 8 senders. Here are the ones you seem to never read:\n\n| Sender | Unread |\n|---|---|\n| marketing@store.com | 12 |\n| weekly@digest.io | 8 |\n| deals@shop.com | 3 |\n\nWould you like me to unsubscribe from any of these?"
                  }
                </Response>
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        {/* Response with Markdown */}
        <Section title="Response (Markdown)">
          <ChatFrame>
            <Message from="assistant">
              <MessageContent variant="flat">
                <Response>
                  {
                    'Here\'s a summary of your inbox rules:\n\n## Active Rules\n\n1. **Newsletter Handler**\n   - Trigger: `from:*@substack.com`\n   - Action: Archive and label as "Newsletter"\n\n2. **Urgent Emails**\n   - Trigger: Subject contains "urgent" or "ASAP"\n   - Action: Star and move to top\n\n> **Tip:** You can combine multiple conditions using AND/OR operators for more precise filtering.\n\n### Quick Stats\n- Rules processed **1,247** emails this month\n- **89%** accuracy rate\n- Most active rule: Newsletter Handler (523 matches)'
                  }
                </Response>
              </MessageContent>
            </Message>
          </ChatFrame>
        </Section>

        {/* Code Block */}
        <Section title="Code Block">
          <div className="space-y-4">
            <MutedText>JSON output:</MutedText>
            <CodeBlock
              code={JSON.stringify(
                {
                  rule: "Newsletter Handler",
                  conditions: {
                    from: "*@substack.com",
                    operator: "OR",
                  },
                  actions: ["archive", "label:Newsletter"],
                  stats: { matched: 523, lastRun: "2026-03-05T10:00:00Z" },
                },
                null,
                2,
              )}
              language="json"
            >
              <CodeBlockCopyButton />
            </CodeBlock>

            <MutedText>TypeScript:</MutedText>
            <CodeBlock
              code={`async function processEmails(rules: Rule[]) {
  const inbox = await searchInbox({ query: "in:inbox" });

  for (const email of inbox.messages) {
    const matchingRule = rules.find((r) => r.matches(email));
    if (matchingRule) {
      await matchingRule.apply(email);
    }
  }
}`}
              language="typescript"
              showLineNumbers
            >
              <CodeBlockCopyButton />
            </CodeBlock>
          </div>
        </Section>

        {/* Suggestions */}
        <Section title="Suggestions">
          <Suggestions>
            <Suggestion suggestion="Help me handle my inbox" />
            <Suggestion suggestion="Clean up newsletters" />
            <Suggestion suggestion="Create a new rule" />
            <Suggestion suggestion="Show my email stats" />
            <Suggestion suggestion="Auto-archive old emails" />
          </Suggestions>
        </Section>

        {/* Prompt Input */}
        <Section title="Prompt Input">
          <div className="space-y-4">
            <MutedText>Default (idle):</MutedText>
            <PromptInput onSubmit={(e) => e.preventDefault()}>
              <PromptInputTextarea disabled />
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputButton>
                    <PaperclipIcon className="size-4" />
                  </PromptInputButton>
                  <PromptInputButton>
                    <ImageIcon className="size-4" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit status="ready" />
              </PromptInputToolbar>
            </PromptInput>

            <MutedText>Submitted (loading):</MutedText>
            <PromptInput onSubmit={(e) => e.preventDefault()}>
              <PromptInputTextarea
                value="Archive all newsletters from last month"
                disabled
              />
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputButton>
                    <PaperclipIcon className="size-4" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit status="submitted" />
              </PromptInputToolbar>
            </PromptInput>

            <MutedText>Streaming:</MutedText>
            <PromptInput onSubmit={(e) => e.preventDefault()}>
              <PromptInputTextarea disabled />
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputButton>
                    <PaperclipIcon className="size-4" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit status="streaming" />
              </PromptInputToolbar>
            </PromptInput>

            <MutedText>Error:</MutedText>
            <PromptInput onSubmit={(e) => e.preventDefault()}>
              <PromptInputTextarea disabled />
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputButton>
                    <PaperclipIcon className="size-4" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit status="error" />
              </PromptInputToolbar>
            </PromptInput>
          </div>
        </Section>

        {/* Shimmer & Loader */}
        <Section title="Shimmer & Loader">
          <div className="space-y-4">
            <MutedText>Shimmer text:</MutedText>
            <Shimmer className="text-sm">
              Thinking about your request...
            </Shimmer>
            <Shimmer className="text-base">
              Searching your inbox for matching emails...
            </Shimmer>
            <Shimmer as="span" className="text-lg font-semibold">
              Processing 47 emails
            </Shimmer>

            <MutedText>Loader:</MutedText>
            <div className="flex items-center gap-4">
              <Loader size={16} />
              <Loader size={24} />
              <Loader size={32} />
            </div>
          </div>
        </Section>

        {/* Empty State */}
        <Section title="Conversation Empty State">
          <div className="h-[200px] rounded-lg border">
            <ConversationEmptyState
              title="Start a conversation"
              description="Ask me anything about your inbox"
            />
          </div>
        </Section>

        {/* Full Chat Layout */}
        <Section title="Full Chat Layout">
          <div className="flex h-[600px] flex-col rounded-lg border">
            <Conversation>
              <ConversationContent>
                <Message from="user">
                  <MessageContent variant="flat">
                    Can you show me a summary of my inbox activity this week?
                  </MessageContent>
                </Message>
                <Message from="assistant">
                  <MessageContent variant="flat">
                    <Reasoning duration={3}>
                      <ReasoningTrigger />
                      <ReasoningContent>
                        Let me pull up the inbox activity for this week. I need
                        to search for all emails and categorize them by type and
                        sender.
                      </ReasoningContent>
                    </Reasoning>
                    <Tool>
                      <ToolHeader
                        title="search_inbox"
                        type="tool-invocation"
                        state="output-available"
                      />
                      <ToolContent>
                        <ToolInput
                          input={{
                            query: "newer_than:7d",
                            maxResults: 100,
                          }}
                        />
                        <ToolOutput
                          output={{
                            total: 67,
                            unread: 12,
                            categories: {
                              newsletters: 23,
                              notifications: 18,
                              direct: 15,
                              promotions: 11,
                            },
                          }}
                          errorText={undefined}
                        />
                      </ToolContent>
                    </Tool>
                    <Response>
                      {
                        "Here's your inbox summary for this week:\n\n- **67 total emails** (12 unread)\n- Newsletters: 23\n- Notifications: 18\n- Direct messages: 15\n- Promotions: 11\n\nWould you like me to help clean up any of these categories?"
                      }
                    </Response>
                  </MessageContent>
                </Message>
                <Message from="user">
                  <MessageContent variant="flat">
                    Yes, archive all the promotions please.
                  </MessageContent>
                </Message>
                <Message from="assistant">
                  <MessageContent variant="flat">
                    <Tool>
                      <ToolHeader
                        title="archive_emails"
                        type="tool-invocation"
                        state="approval-requested"
                      />
                      <ToolContent>
                        <ToolInput
                          input={{
                            action: "archive",
                            filter: "category:promotions newer_than:7d",
                            count: 11,
                          }}
                        />
                      </ToolContent>
                    </Tool>
                    <Response>
                      {
                        "I'm ready to archive **11 promotional emails**. Please confirm to proceed."
                      }
                    </Response>
                  </MessageContent>
                </Message>
              </ConversationContent>
            </Conversation>
            <div className="border-t p-3">
              <PromptInput onSubmit={(e) => e.preventDefault()}>
                <PromptInputTextarea disabled />
                <PromptInputToolbar>
                  <PromptInputTools>
                    <PromptInputButton>
                      <PaperclipIcon className="size-4" />
                    </PromptInputButton>
                  </PromptInputTools>
                  <PromptInputSubmit status="ready" />
                </PromptInputToolbar>
              </PromptInput>
            </div>
          </div>
        </Section>
      </div>
    </Container>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="underline">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ChatFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1 rounded-lg border p-4">{children}</div>;
}
