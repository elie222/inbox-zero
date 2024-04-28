import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { GroupItemType, Prisma, RuleType } from "@prisma/client";
import { getGmailClient } from "@/utils/gmail/client";
import { gmail_v1 } from "googleapis";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload } from "@/utils/types";
import { extractEmailAddress } from "@/utils/email";
import { EmailList } from "@/components/email-list/EmailList";
import { groupBy } from "lodash";

type RuleWithGroup = Prisma.RuleGetPayload<{
  include: { group: { include: { items: true } } };
}>;

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

  const messages = await Promise.all(
    exampleMessages?.map(async (message) => {
      const fullMessage = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });
      return parseMessage(fullMessage.data as MessageWithPayload);
    }) || [],
  );

  const threads = groupBy(messages, (m) => m.threadId);

  return (
    <div className="">
      <EmailList
        threads={Object.entries(threads).map(([id, messages]) => ({
          id,
          messages,
          snippet: messages[0]?.snippet || "",
          plan: undefined,
          category: null,
        }))}
        hideActionBarWhenEmpty
        // refetch={() => mutate()}
      />
    </div>
  );
}

async function fetchExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
) {
  let q = "";
  switch (rule.type) {
    case RuleType.STATIC:
      q = staticQuery(rule);
      break;
    case RuleType.GROUP:
      q = groupQuery(rule);
      break;
    case RuleType.AI:
      return [];
  }

  console.log("🚀 ~ q:", q);
  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q,
  });

  return response.data.messages;
}

function staticQuery(rule: RuleWithGroup) {
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

  return q;
}

function groupQuery(rule: RuleWithGroup) {
  const items = rule.group?.items || [];

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

  return q;
}
