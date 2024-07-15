import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { RuleForm } from "@/app/(app)/automation/RuleForm";
import { TopSection } from "@/components/TopSection";

export default async function RulePage({
  params,
  searchParams,
}: {
  params: { ruleId: string };
  searchParams: { new: string };
}) {
  const session = await auth();

  if (!session?.user.email) throw new Error("Not logged in");

  const rule = await prisma.rule.findUnique({
    where: { id: params.ruleId, userId: session.user.id },
    include: {
      actions: true,
    },
  });

  if (!rule) throw new Error("Rule not found");

  const ruleWithActions = {
    ...rule,
    actions: rule.actions.map((action) => ({
      ...action,
      label: action.labelPrompt
        ? { value: action.labelPrompt, ai: true }
        : { value: action.label, ai: false },
      subject: action.subjectPrompt
        ? { value: action.subjectPrompt, ai: true }
        : { value: action.subject, ai: false },
      content: action.contentPrompt
        ? { value: action.contentPrompt, ai: true }
        : { value: action.content, ai: false },
      to: action.toPrompt
        ? { value: action.toPrompt, ai: true }
        : { value: action.to, ai: false },
      cc: action.ccPrompt
        ? { value: action.ccPrompt, ai: true }
        : { value: action.cc, ai: false },
      bcc: action.bccPrompt
        ? { value: action.bccPrompt, ai: true }
        : { value: action.bcc, ai: false },
    })),
  };

  return (
    <div>
      {searchParams.new === "true" && (
        <TopSection
          title="Here are your rule settings!"
          descriptionComponent={
            <p>
              These rules were AI generated, feel free to adjust them to your
              needs.
            </p>
          }
        />
      )}
      <div className="content-container mx-auto w-full max-w-3xl">
        <RuleForm rule={ruleWithActions} />
      </div>
    </div>
  );
}
