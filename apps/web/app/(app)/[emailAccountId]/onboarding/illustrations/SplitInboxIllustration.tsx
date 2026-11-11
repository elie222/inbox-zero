"use client";

import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
    subject: msg`Q3 planning: can you review?`,
    snippet: msg`I put together a first pass at the roadmap and would love your eyes on it`,
    date: msg`10:24 AM`,
    label: "To Reply",
    unread: true,
  },
  {
    from: "The Weekly Digest",
    subject: msg`Five ideas worth stealing this week`,
    snippet: msg`Plus a deep dive on pricing pages that convert`,
    date: msg`9:40 AM`,
    label: "Newsletter",
    unread: true,
  },
  {
    from: "Priya Patel",
    subject: msg`Can we move Thursday's call?`,
    snippet: msg`Something came up on my end. Would Friday morning work instead?`,
    date: msg`9:12 AM`,
    label: "To Reply",
    unread: true,
  },
  {
    from: "Jordan Lee",
    subject: msg`Invitation: Design sync`,
    snippet: msg`Thursday 2:00 PM to 2:30 PM. Join with video link`,
    date: msg`8:55 AM`,
    label: "Calendar",
    unread: false,
  },
  {
    from: "Acme Billing",
    subject: msg`Your receipt #2041`,
    snippet: msg`Thanks for your payment of $49.00. Your receipt is attached`,
    date: msg`Yesterday`,
    label: "Receipt",
    unread: false,
  },
  {
    from: "Product Notes",
    subject: msg`What we shipped in October`,
    snippet: msg`Faster search, offline mode, and a new keyboard shortcut sheet`,
    date: msg`Yesterday`,
    label: "Newsletter",
    unread: false,
  },
  {
    from: "Marcus Wright",
    subject: msg`Re: Intro to the design team`,
    snippet: msg`Great to meet you! Happy to share the brand guidelines`,
    date: msg`Mon`,
    label: "To Reply",
    unread: false,
  },
];

const countsById = new Map(
  splitNames.map((name) => [
    name,
    threads.filter((thread) => thread.label === name).length,
  ]),
);

const sidebarItems = [
  { id: "inbox", name: msg`Inbox`, Icon: InboxIcon, count: threads.length },
  { id: "starred", name: msg`Starred`, Icon: StarIcon, count: null },
  { id: "sent", name: msg`Sent`, Icon: SendIcon, count: null },
  { id: "drafts", name: msg`Drafts`, Icon: FileIcon, count: null },
];

export function SplitInboxIllustration() {
  const { i18n } = useLingui();
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
  const splits = [ALL_SPLIT_ID, ...splitNames].map((id) => ({
    id,
    // Split names are real label names, so only "All" is translated.
    name: id === ALL_SPLIT_ID ? i18n._(msg`All`) : id,
    deletable: false,
  }));

  return (
    <IllustrationWindow className="w-full max-w-[720px]">
      <div className="flex h-[440px]">
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar p-2 sm:flex">
          {sidebarItems.map(({ id, name, Icon, count }) => {
            const { className, content } = getMailSidebarRowPresentation({
              active: id === "inbox",
              icon: <Icon className="size-4 shrink-0" />,
              name: i18n._(name),
              count,
              emphasizeCount: true,
            });
            return (
              <div key={id} className={className}>
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
                key={thread.subject.id}
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
                  subject={i18n._(thread.subject)}
                  snippet={i18n._(thread.snippet)}
                  date={
                    <span className="text-xs text-muted-foreground">
                      {i18n._(thread.date)}
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
