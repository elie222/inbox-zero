"use client";

import {
  SearchInboxTool,
  ReadEmailTool,
  ArchiveEmailsTool,
  LabelEmailsTool,
  DraftReplyTool,
  SendReplyTool,
  UpdateSettingsTool,
  EnableSendingTool,
} from "./tools";

const mockSearchResults = {
  query: "newsletter unsubscribe",
  results: [
    {
      id: "1",
      subject: "Your Weekly Tech Digest",
      from: "newsletter@techdigest.com",
      date: "Jan 28, 2026",
      snippet:
        "This week in tech: AI advances, new frameworks, and more. Click here to unsubscribe...",
      isRead: true,
    },
    {
      id: "2",
      subject: "Marketing Tips for 2026",
      from: "updates@marketingpro.io",
      date: "Jan 27, 2026",
      snippet:
        "Boost your marketing game with these 10 tips. Unsubscribe from this list...",
      isRead: false,
    },
    {
      id: "3",
      subject: "Daily News Roundup",
      from: "daily@newsroundup.com",
      date: "Jan 26, 2026",
      snippet:
        "Today's top stories from around the world. To unsubscribe, click here...",
      isRead: true,
    },
  ],
  totalCount: 47,
};

const mockEmail = {
  id: "1",
  subject: "Q1 Planning Meeting Notes",
  from: "alex@company.com",
  to: "me@example.com",
  date: "January 28, 2026 at 2:30 PM",
  body: `Hi team,

Here are the notes from our Q1 planning meeting:

1. Revenue targets: $2M ARR by end of Q1
2. New features: AI assistant improvements, mobile app
3. Hiring: 2 engineers, 1 designer

Action items:
- Sarah: Draft product roadmap by Friday
- Mike: Finalize budget proposal
- Everyone: Review OKRs and provide feedback

Let me know if I missed anything!

Best,
Alex`,
  labels: ["Work", "Important"],
};

const mockDraftReply = {
  draftId: "draft-123",
  to: "alex@company.com",
  subject: "Re: Q1 Planning Meeting Notes",
  body: `Hi Alex,

Thanks for sharing the meeting notes! A few thoughts:

1. The revenue targets look ambitious but achievable
2. I'm excited about the AI assistant improvements
3. I can help review candidates for the engineering roles

I'll have my OKR feedback ready by Wednesday.

Best,
[Your name]`,
};

const mockSendReply = {
  emailId: "1",
  to: "alex@company.com",
  subject: "Re: Q1 Planning Meeting Notes",
  body: `Hi Alex,

Thanks for the notes! I'll review the OKRs and get back to you by Wednesday.

Best,
[Your name]`,
};

const mockSettingsUpdate = {
  settings: [
    {
      key: "auto_draft",
      label: "Auto-draft replies",
      description: "Automatically create draft replies for common emails",
      currentValue: false,
      newValue: true,
    },
    {
      key: "auto_label",
      label: "Auto-label newsletters",
      description:
        "Automatically apply 'Newsletter' label to detected newsletters",
      currentValue: true,
      newValue: true,
    },
    {
      key: "auto_archive",
      label: "Auto-archive read newsletters",
      description: "Archive newsletters after you've read them",
      currentValue: false,
      newValue: true,
    },
  ],
};

export function AgentToolsDemo() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-xl font-semibold">Agent Tool UI Components</h2>
        <p className="mb-6 text-muted-foreground">
          These are the tool UI components used in the onboarding chat to
          display results and request user actions.
        </p>
      </div>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Search Inbox (Loading)
        </h3>
        <SearchInboxTool
          input={{ query: "newsletter unsubscribe", maxResults: 10 }}
          isLoading
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Search Inbox (Complete)
        </h3>
        <SearchInboxTool
          input={{ query: "newsletter unsubscribe", maxResults: 10 }}
          output={mockSearchResults}
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Read Email (Complete)
        </h3>
        <ReadEmailTool input={{ emailId: "1" }} output={mockEmail} />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Archive Emails (Complete)
        </h3>
        <ArchiveEmailsTool
          input={{
            emailIds: ["1", "2", "3"],
            reason: "These newsletters haven't been read in over 30 days",
          }}
          output={{ archivedCount: 3, emailIds: ["1", "2", "3"] }}
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Label Emails (Complete)
        </h3>
        <LabelEmailsTool
          input={{ emailIds: ["1", "2"], label: "Newsletter" }}
          output={{ labeledCount: 2, label: "Newsletter" }}
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Draft Reply (Complete)
        </h3>
        <DraftReplyTool
          input={{ emailId: "1", instructions: "Write a brief acknowledgment" }}
          output={mockDraftReply}
          onViewDraft={(id) => console.log("View draft:", id)}
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Send Reply (Action Required)
        </h3>
        <SendReplyTool
          input={mockSendReply}
          onApprove={() => console.log("Approved")}
          onDeny={() => console.log("Denied")}
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Update Settings (Action Required)
        </h3>
        <UpdateSettingsTool
          input={mockSettingsUpdate}
          onConfirm={() => console.log("Settings confirmed")}
          onCancel={() => console.log("Settings cancelled")}
        />
      </section>

      <section>
        <h3 className="mb-3 font-medium text-muted-foreground">
          Enable Sending (Action Required)
        </h3>
        <EnableSendingTool
          onEnable={() => console.log("Sending enabled")}
          onSkip={() => console.log("Skipped")}
        />
      </section>
    </div>
  );
}
