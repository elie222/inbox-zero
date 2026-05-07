import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { isEligibleForClassificationFeedback } from "@/utils/rule/consts";
import type { SystemType } from "@/generated/prisma/enums";
import { FeedbackForm } from "./FeedbackForm";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const messageId =
    typeof params.messageId === "string" ? params.messageId : null;
  const fromEmail =
    typeof params.fromEmail === "string" ? params.fromEmail : null;
  const ruleId = typeof params.ruleId === "string" ? params.ruleId : null;

  if (!messageId || !fromEmail || !ruleId) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">
          Missing required parameters. This link may be malformed.
        </p>
      </div>
    );
  }

  const session = await auth();
  if (!session?.user) redirect("/login");

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!emailAccount) redirect("/connect-mailbox");

  const allRules = await prisma.rule.findMany({
    where: { emailAccountId: emailAccount.id },
    select: { id: true, name: true, systemType: true },
    orderBy: { name: "asc" },
  });

  const rules = allRules
    .filter((r) =>
      isEligibleForClassificationFeedback(r.systemType as SystemType | null),
    )
    .map((r) => ({ id: r.id, name: r.name }));

  const oldRule = rules.find((r) => r.id === ruleId);

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Correct classification
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        From: <span className="font-medium text-gray-700">{fromEmail}</span>
      </p>

      {rules.length === 0 ? (
        <p className="text-sm text-gray-500">No learnable rules found.</p>
      ) : (
        <FeedbackForm
          messageId={messageId}
          fromEmail={fromEmail}
          oldRuleId={ruleId}
          oldRuleName={oldRule?.name ?? ruleId}
          rules={rules}
        />
      )}
    </div>
  );
}
