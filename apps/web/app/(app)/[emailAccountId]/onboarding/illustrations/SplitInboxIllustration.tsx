"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileIcon, InboxIcon, SendIcon, StarIcon } from "lucide-react";
import { getMailSidebarRowPresentation } from "@inboxzero/mail-ui/MailSidebarRow";
import { MailThreadRow } from "@inboxzero/mail-ui/MailThreadRow";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import { SplitTabs } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";
import { IllustrationWindow } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/IllustrationWindow";

const ALL_SPLIT_ID = "All";
const splitNames = ["To Reply", "Newsletter", "Calendar", "Receipt"];
// The tabs the illustration steps through to show a split narrowing the list.
const cycle = [ALL_SPLIT_ID, "To Reply", "Newsletter"];

const threads = [
  {
    from: "Sarah Chen",
    subject: "Q3 planning: can you review?",
    snippet:
      "I put together a first pass at the roadmap and would love your eyes on it",
    date: "10:24 AM",
    label: "To Reply",
    unread: true,
  },
  {
    from: "The Weekly Digest",
    subject: "Five ideas worth stealing this week",
    snippet: "Plus a deep dive on pricing pages that convert",
    date: "9:40 AM",
    label: "Newsletter",
    unread: true,
  },
  {
    from: "Priya Patel",
    subject: "Can we move Thursday's call?",
    snippet: "Something came up on my end. Would Friday morning work instead?",
    date: "9:12 AM",
    label: "To Reply",
    unread: true,
  },
  {
    from: "Jordan Lee",
    subject: "Invitation: Design sync",
    snippet: "Thursday 2:00 PM to 2:30 PM. Join with video link",
    date: "8:55 AM",
    label: "Calendar",
    unread: false,
  },
  {
    from: "Acme Billing",
    subject: "Your receipt #2041",
    snippet: "Thanks for your payment of $49.00. Your receipt is attached",
    date: "Yesterday",
    label: "Receipt",
    unread: false,
  },
  {
    from: "Product Notes",
    subject: "What we shipped in October",
    snippet: "Faster search, offline mode, and a new keyboard shortcut sheet",
    date: "Yesterday",
    label: "Newsletter",
    unread: false,
  },
  {
    from: "Marcus Wright",
    subject: "Re: Intro to the design team",
    snippet: "Great to meet you! Happy to share the brand guidelines",
    date: "Mon",
    label: "To Reply",
    unread: false,
  },
];

const splits = [ALL_SPLIT_ID, ...splitNames].map((name) => ({
  id: name,
  name,
  deletable: false,
}));

const countsById = new Map(
  splitNames.map((name) => [
    name,
    threads.filter((thread) => thread.label === name).length,
  ]),
);

const sidebarItems = [
  { name: "Inbox", Icon: InboxIcon, count: threads.length },
  { name: "Starred", Icon: StarIcon, count: null },
  { name: "Sent", Icon: SendIcon, count: null },
  { name: "Drafts", Icon: FileIcon, count: null },
];

export function SplitInboxIllustration() {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => setStep((s) => s + 1), 2800);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  const activeSplitId = cycle[step % cycle.length];
  const visibleThreads =
    activeSplitId === ALL_SPLIT_ID
      ? threads
      : threads.filter((thread) => thread.label === activeSplitId);

  return (
    <IllustrationWindow className="w-full max-w-[720px]">
      <div className="flex h-[440px]">
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar p-2 sm:flex">
          {sidebarItems.map(({ name, Icon, count }) => {
            const { className, content } = getMailSidebarRowPresentation({
              active: name === "Inbox",
              icon: <Icon className="size-4 shrink-0" />,
              name,
              count,
              emphasizeCount: true,
            });
            return (
              <div key={name} className={className}>
                {content}
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-hidden bg-background [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]">
          <SplitTabs
            className="pt-3"
            splits={splits}
            activeSplitId={activeSplitId}
            countsById={countsById}
            onSelect={noop}
            onDelete={noop}
            onNewSplit={noop}
            canCreateSplits
          />
          <AnimatePresence initial={false} mode="popLayout">
            {visibleThreads.map((thread, index) => (
              <motion.div
                key={thread.subject}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <MailThreadRow
                  index={index}
                  layout="split"
                  participantSummary={thread.from}
                  subject={thread.subject}
                  snippet={thread.snippet}
                  date={
                    <span className="text-xs text-muted-foreground">
                      {thread.date}
                    </span>
                  }
                  labels={[
                    <MailLabelChip key={thread.label} name={thread.label} />,
                  ]}
                  isUnread={thread.unread}
                  isStarred={false}
                  isDraft={false}
                  messageCount={1}
                  isFocused={false}
                  isSelected={false}
                  hasAnySelection={false}
                  selectionEnabled={false}
                  onOpen={noop}
                  onToggleSelect={noop}
                  onSelectRangeTo={noop}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </IllustrationWindow>
  );
}

function noop() {}
