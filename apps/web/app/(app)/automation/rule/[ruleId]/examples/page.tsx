import Link from "next/link";
import { redirect } from "next/navigation";
import { type gmail_v1 } from "googleapis";
import groupBy from "lodash/groupBy";
import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { GroupItemType, RuleType } from "@prisma/client";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { extractEmailAddress } from "@/utils/email";
import { TopSection } from "@/components/TopSection";
import { Button } from "@/components/ui/button";
import { findMatchingGroupItem } from "@/utils/group/find-matching-group";
import { getMessage } from "@/utils/gmail/message";
import { ExampleList } from "@/app/(app)/automation/rule/[ruleId]/examples/example-list";
import {
  MessageWithGroupItem,
  RuleWithGroup,
} from "@/app/(app)/automation/rule/[ruleId]/examples/types";
import { matchesStaticRule } from "@/app/api/google/webhook/static-rule";

export const dynamic = "force-dynamic";

export default async function RuleExamplesPage({
  params,
}: {
  params: { ruleId: string };
}) {
  const session = await auth();

  if (!session?.user.email) throw new Error("Not logged in");

  const rule = await prisma.rule.findUnique({
    where: { id: params.ruleId, userId: session.user.id },
    include: { group: { include: { items: true } } },
  });

  if (!rule) throw new Error("Rule not found");

  const gmail = getGmailClient(session);

  const exampleMessages = await fetchExampleMessages(rule, gmail);

  const threads = groupBy(exampleMessages, (m) => m.threadId);
  const groupedBySenders = groupBy(threads, (t) => t[0]?.headers.from);

  const continueHref = `/automation/rule/${rule.id}?new=true`;

  const hasExamples = Object.keys(groupedBySenders).length > 0;

  // we don't have examples for AI rules atm
  if (rule.type === RuleType.AI) redirect(continueHref);

  return (
    <div>
      <TopSection
        title="Your automation has been created!"
        descriptionComponent={
          <>
            {hasExamples ? (
              <p>
                Here are some examples of previous emails that match this rule.
              </p>
            ) : (
              <p>
                We did not find any examples to show you that match this rule.
              </p>
            )}
            <Button className="mt-4" asChild>
              <Link href={continueHref}>Continue</Link>
            </Button>
          </>
        }
      />
      <div className="m-4 grid max-w-4xl gap-4">
        <ExampleList groupedBySenders={groupedBySenders} />
      </div>

      {hasExamples && (
        <div className="m-4 pb-10">
          <Button size="lg" asChild>
            <Link href={continueHref}>Continue</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

async function fetchExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
) {
  switch (rule.type) {
    case RuleType.STATIC:
      return fetchStaticExampleMessages(rule, gmail);
    case RuleType.GROUP:
      if (!rule.group) return [];
      return fetchGroupExampleMessages(rule.group, gmail);
    case RuleType.AI:
      return [];
  }
}

async function fetchStaticExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
): Promise<MessageWithGroupItem[]> {
  let q = "";
  if (rule.from) {
    q += `from:${rule.from} `;
  }
  if (rule.to) {
    q += `to:${rule.to} `;
  }
  if (rule.subject) {
    q += `subject:${rule.subject} `;
  }

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q,
  });

  const messages = await Promise.all(
    (response.data.messages || []).map(async (message) => {
      const m = await getMessage(message.id!, gmail);
      const parsedMessage = parseMessage(m);
      return parsedMessage;
    }),
  );

  // search might include messages that don't match the rule, so we filter those out
  return messages.filter((message) => matchesStaticRule(rule, message));
}

async function fetchGroupExampleMessages(
  group: NonNullable<RuleWithGroup["group"]>,
  gmail: gmail_v1.Gmail,
): Promise<MessageWithGroupItem[]> {
  const items = group.items || [];

  let q = "";

  const froms = items
    .filter((item) => item.type === GroupItemType.FROM)
    .slice(0, 50);
  const subjects = items
    .filter((item) => item.type === GroupItemType.SUBJECT)
    .slice(0, 50);

  if (froms.length > 0) {
    q += `from:(${froms
      .map((item) => `"${extractEmailAddress(item.value)}"`)
      .join(" OR ")}) `;
  }
  if (subjects.length > 0) {
    q += `subject:(${subjects.map((item) => item.value).join(" OR ")}) `;
  }

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q,
  });

  const messages = await Promise.all(
    (response.data.messages || []).map(async (message) => {
      const m = await getMessage(message.id!, gmail);
      const parsedMessage = parseMessage(m);

      return {
        ...parsedMessage,
        matchingGroupItem: findMatchingGroupItem(
          parsedMessage.headers,
          group.items,
        ),
      };
    }),
  );

  // search might include messages that don't match the rule, so we filter those out
  return messages.filter((message) => message.matchingGroupItem);
}
