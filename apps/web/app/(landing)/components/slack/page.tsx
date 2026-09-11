import { Fragment, type ReactNode } from "react";
import Image from "next/image";
import { Container } from "@/components/Container";
import {
  PageHeading,
  PageSubHeading,
  SectionHeader,
  TextLink,
} from "@/components/Typography";
import { cn } from "@/utils";
import { ActionType, ThreadTrackerType } from "@/generated/prisma/enums";
import { buildSlackRuleNotificationPreviewBlocks } from "@/utils/messaging/rule-notifications";
import { buildAppHomeBlocks } from "@/utils/messaging/providers/slack/messages/app-home";
import { buildDigestBlocks } from "@/utils/messaging/providers/slack/messages/digest";
import {
  buildDocumentAskBlocks,
  buildDocumentFiledBlocks,
} from "@/utils/messaging/providers/slack/messages/document-filing";
import { buildFollowUpReminderBlocks } from "@/utils/messaging/providers/slack/messages/follow-up-reminder";
import { buildMeetingBriefingBlocks } from "@/utils/messaging/providers/slack/messages/meeting-briefing";

type SlackTextObject = {
  type: string;
  text: string;
  emoji?: boolean;
};

type SlackElement = {
  type: string;
  text?: SlackTextObject;
  placeholder?: SlackTextObject;
  options?: Array<{
    text: SlackTextObject;
    value: string;
  }>;
  url?: string;
  style?: "primary" | "danger";
  action_id?: string;
  value?: string;
};

type SlackBlock = {
  type: string;
  text?: SlackTextObject;
  elements?: SlackElement[];
  fields?: SlackTextObject[];
};

type SlackPreview = {
  title: string;
  blocks?: SlackBlock[];
  text?: string;
};

const slackPreviews: SlackPreview[] = [
  {
    title: "Channel confirmation",
    text: "✅ Inbox Zero connected! You can mention <@UAPP123> in this channel to chat about your emails. If you enable meeting briefs or attachment filing notifications, I can send those here too.",
  },
  {
    title: "Connection onboarding DM",
    text: "✅ Inbox Zero connected. Next, choose a private channel in Inbox Zero Settings for meeting brief and attachment notifications, then invite <@UAPP123> there. You can also DM me anytime to chat about your emails.",
  },
  {
    title: "Automation channel message",
    text: "Rule matched: a high priority email needs review.\n\n_Reply with <@UAPP123> to chat about your emails._",
  },
  {
    title: "Draft reply notification",
    blocks: buildSlackRuleNotificationPreviewBlocks({
      actionId: "demo-draft-action",
      actionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      email: {
        headers: {
          from: "Avery Customer <avery.customer@example.com>",
          subject: "Question about the launch checklist and rollout timeline",
        },
        snippet:
          "Could you confirm whether the migration checklist includes SSO, billing handoff, and a rollback plan?",
        textPlain:
          "Could you confirm whether the migration checklist includes SSO, billing handoff, and a rollback plan? The implementation team also had a few notes from the kickoff.\n\nOn Friday, Jane wrote:\n> We should confirm this covers the rollout checklist.",
      },
      draftContent:
        "Thanks for sending this over. The checklist covers SSO and billing handoff, and I added a rollback section for the implementation team to review.",
      openLink: {
        label: "Open in Gmail",
        url: "https://mail.example.com/thread/demo",
      },
    }) as SlackBlock[],
  },
  {
    title: "Email notification",
    blocks: buildSlackRuleNotificationPreviewBlocks({
      actionId: "demo-notify-action",
      actionType: ActionType.NOTIFY_MESSAGING_CHANNEL,
      email: {
        headers: {
          from: "Billing Team <billing@example.com>",
          subject: "Receipt and account update",
        },
        snippet:
          "Your receipt is attached. Please review the account details and forward this to the finance workspace if everything looks correct.",
      },
      openLink: {
        label: "Open in Gmail",
        url: "https://mail.example.com/thread/demo",
      },
    }) as SlackBlock[],
  },
  {
    title: "Follow-up awaiting reply",
    blocks: buildFollowUpReminderBlocks({
      subject: "Contract terms and final approval next steps",
      counterpartyName: "Jane Partner",
      counterpartyEmail: "jane.partner@example.com",
      trackerType: ThreadTrackerType.AWAITING,
      daysSinceSent: 4,
      snippet:
        "Wanted to check whether the redlines have landed.\n> On Friday, Jane wrote: We will review this with legal and reply shortly.",
      threadLink: "https://mail.example.com/thread/awaiting",
      threadLinkLabel: "Open in Gmail",
      trackerId: "tracker-awaiting",
    }) as SlackBlock[],
  },
  {
    title: "Follow-up needs reply",
    blocks: buildFollowUpReminderBlocks({
      subject:
        "Implementation questions for the migration plan and launch timeline",
      counterpartyName: "Alex Customer",
      counterpartyEmail: "alex.customer@example.com",
      trackerType: ThreadTrackerType.NEEDS_REPLY,
      daysSinceSent: 1,
      snippet:
        "Could you walk me through the SSO setup and confirm the staging domain before Thursday?",
      trackerId: "tracker-needs-reply",
    }) as SlackBlock[],
  },
  {
    title: "Digest with overflow",
    blocks: buildDigestBlocks({
      date: new Date("2026-04-21T09:00:00Z"),
      ruleNames: {
        newsletters: "Newsletters",
        receipts: "Receipts",
      },
      itemsByRule: {
        newsletters: [
          { from: "Acme Weekly", subject: "This week in product updates" },
          { from: "Design Notes", subject: "Five patterns worth saving" },
          { from: "Morning Brief", subject: "Markets and tech headlines" },
          { from: "Dev Digest", subject: "TypeScript changes to know" },
          { from: "Ops Weekly", subject: "Reliability review" },
          { from: "Product Hunt", subject: "Launches you might like" },
          { from: "Security Feed", subject: "New dependency advisories" },
        ],
        receipts: [
          { from: "Stripe", subject: "Your receipt from Example App" },
          { from: "Cloud Vendor", subject: "Monthly invoice available" },
        ],
      },
    }) as SlackBlock[],
  },
  {
    title: "Meeting briefing",
    blocks: buildMeetingBriefingBlocks({
      meetingTitle: "Customer implementation review",
      formattedTime: "Today at 2:00 PM",
      videoConferenceLink: "https://meet.example.com/customer-review",
      eventUrl: "https://calendar.example.com/event/123",
      briefingContent: {
        guests: [
          {
            name: "Jamie Lee",
            email: "jamie@example.com",
            bullets: [
              "Leads platform operations for the customer team",
              "Last thread asked for status and launch risks",
            ],
          },
          {
            name: "Morgan Patel",
            email: "morgan@example.com",
            bullets: [
              "Owns security review",
              "Previously requested SSO documentation",
            ],
          },
        ],
        internalTeamMembers: [
          { name: "Taylor Admin", email: "taylor@example.com" },
        ],
      },
    }) as SlackBlock[],
  },
  {
    title: "Document filed",
    blocks: buildDocumentFiledBlocks({
      filename: "invoice-2026-04.pdf",
      folderPath: "Finance/Invoices/2026",
      driveProvider: "google",
      senderEmail: "vendor@example.com",
      fileId: "file_123",
    }) as SlackBlock[],
  },
  {
    title: "Document filing question",
    blocks: buildDocumentAskBlocks({
      filename: "contract-draft-v2.docx",
      senderEmail: "legal@example.com",
      reasoning:
        "This looks like a legal contract, but it mentions two projects.",
    }) as SlackBlock[],
  },
  {
    title: "App Home",
    blocks: buildAppHomeBlocks().blocks as SlackBlock[],
  },
];

export default function SlackComponentsPage() {
  return (
    <Container size="6xl">
      <div className="space-y-8 py-8">
        <div className="space-y-3">
          <TextLink href="/components">← Components</TextLink>
          <div className="space-y-2">
            <PageHeading>Slack Components</PageHeading>
            <PageSubHeading>
              Storybook-style previews for Slack messages sent by Inbox Zero.
            </PageSubHeading>
          </div>
        </div>

        <section className="space-y-6">
          {slackPreviews.map((preview) => (
            <SlackPreviewCard key={preview.title} preview={preview} />
          ))}
        </section>
      </div>
    </Container>
  );
}

function SlackPreviewCard({ preview }: { preview: SlackPreview }) {
  return (
    <article className="space-y-3">
      <SectionHeader>{preview.title}</SectionHeader>

      <div className="min-w-0 rounded-lg border border-[#35373d] bg-[#1a1d21] p-5">
        <div className="flex items-start gap-3">
          <Image
            alt=""
            className="size-10 shrink-0 rounded-lg"
            height={40}
            src="/icons/icon-192x192.png"
            width={40}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[15px] font-bold leading-5 text-[#f8f8f8]">
                Inbox Zero
              </span>
              <span className="rounded bg-[#383a40] px-1 text-[10px] font-bold leading-4 text-[#d1d2d3]">
                APP
              </span>
              <span className="text-[15px] leading-5 text-[#ababad]">
                9:41 AM
              </span>
            </div>
            <div className="mt-1 space-y-3 text-[15px] leading-6 text-[#d1d2d3]">
              {preview.blocks ? (
                <SlackBlocks blocks={preview.blocks} />
              ) : (
                <SlackText text={preview.text ?? ""} />
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SlackBlocks({ blocks }: { blocks: SlackBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <SlackBlockView key={`${block.type}-${index}`} block={block} />
      ))}
    </>
  );
}

function SlackBlockView({ block }: { block: SlackBlock }) {
  if (block.type === "header") {
    return (
      <h3 className="text-[15px] font-bold leading-6 text-[#d1d2d3]">
        {renderTextObject(block.text)}
      </h3>
    );
  }

  if (block.type === "section") {
    return (
      <div className="whitespace-pre-wrap break-words">
        {renderTextObject(block.text)}
        {block.fields && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {block.fields.map((field, index) => (
              <div key={`${field.text}-${index}`}>
                {renderTextObject(field)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (block.type === "context") {
    return (
      <div className="flex flex-wrap items-center gap-1 text-[13px] leading-5 text-[#ababad]">
        {block.elements?.map((element, index) => (
          <span key={`${element.type}-${index}`}>
            {renderTextObject(element.text)}
          </span>
        ))}
      </div>
    );
  }

  if (block.type === "divider") {
    return <hr className="my-3 border-[#35373d]" />;
  }

  if (block.type === "actions") {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        {block.elements?.map((element, index) => (
          <SlackButton
            element={element}
            key={`${buttonLabel(element)}-${index}`}
          />
        ))}
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded bg-[#222529] p-2 text-xs text-[#d1d2d3]">
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

function SlackButton({ element }: { element: SlackElement }) {
  if (element.type === "static_select") {
    return (
      <button
        className="h-9 rounded border border-[#5e6167] bg-transparent px-3 text-sm font-bold text-[#f8f8f8]"
        type="button"
      >
        {element.placeholder?.text ?? "More"} ▾
      </button>
    );
  }

  return (
    <button
      className={cn(
        "h-9 rounded border border-[#5e6167] bg-transparent px-3 text-sm font-bold text-[#f8f8f8]",
        element.style === "primary" &&
          "border-[#148567] bg-[#148567] text-white",
        element.style === "danger" && "border-[#e01e5a] text-[#e01e5a]",
      )}
      type="button"
    >
      {buttonLabel(element)}
    </button>
  );
}

function SlackText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words">{renderMrkdwn(text)}</div>
  );
}

function renderTextObject(textObject: SlackTextObject | undefined) {
  if (!textObject) return null;
  if (textObject.type === "mrkdwn") return renderMrkdwn(textObject.text);
  return textObject.text;
}

function renderMrkdwn(text: string) {
  const lines = text.split("\n");

  return lines.map((line, index) => {
    const content = line.startsWith(">") ? line.replace(/^>\s?/, "") : line;
    const rendered = renderInlineMrkdwn(content);

    if (line.startsWith(">")) {
      return (
        <blockquote
          className="my-1 border-l-4 border-[#b2b8c6] pl-3 text-[#d1d2d3]"
          key={`${line}-${index}`}
        >
          {rendered}
        </blockquote>
      );
    }

    return (
      <Fragment key={`${line}-${index}`}>
        {rendered}
        {index < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function renderInlineMrkdwn(text: string): ReactNode[] {
  const parts = text.split(/(<[^>|]+(?:\|[^>]+)?>|`[^`]+`|\*[^*]+\*|_[^_]+_)/g);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("<") && part.endsWith(">")) {
      return renderSlackLink(part, index);
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          className="rounded border border-[#42454a] bg-[#222529] px-1 py-0.5 text-[13px] text-[#ffa657]"
          key={`${part}-${index}`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <strong key={`${part}-${index}`}>
          {renderInlineMrkdwn(part.slice(1, -1))}
        </strong>
      );
    }

    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <em key={`${part}-${index}`}>
          {renderInlineMrkdwn(part.slice(1, -1))}
        </em>
      );
    }

    return decodeSlackText(part);
  });
}

function renderSlackLink(part: string, index: number) {
  const value = part.slice(1, -1);

  if (value.startsWith("@")) {
    const displayName = value === "@UAPP123" ? "@Inbox Zero" : value;

    return (
      <span
        className="rounded bg-[#132d3f] px-1 font-medium text-[#36c5f0]"
        key={`${part}-${index}`}
      >
        {displayName}
      </span>
    );
  }

  const [href = "", label] = value.split("|");
  return (
    <a
      className="font-medium text-[#36c5f0] hover:underline"
      href={href.startsWith("http") ? href : "#"}
      key={`${part}-${index}`}
      rel="noreferrer"
      target="_blank"
    >
      {label ?? href}
    </a>
  );
}

function buttonLabel(element: SlackElement) {
  return element.text?.text ?? "Button";
}

function decodeSlackText(text: string) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
