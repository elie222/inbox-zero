import { redirect } from "next/navigation";
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
  if (!session?.user) redirect("/login");

  const rule = await prisma.rule.findUnique({
    where: { id: params.ruleId, userId: session.user.id },
    include: {
      actions: true,
      categoryFilters: true,
    },
  });

  if (!rule) throw new Error("Rule not found");

  const ruleWithActions = {
    ...rule,
    actions: rule.actions.map((action) => ({
      ...action,
      label:
        typeof action.labelPrompt === "string"
          ? { value: action.labelPrompt, ai: true }
          : { value: action.label, ai: false },
      subject:
        typeof action.subjectPrompt === "string"
          ? { value: action.subjectPrompt, ai: true }
          : { value: action.subject, ai: false },
      content:
        typeof action.contentPrompt === "string"
          ? { value: action.contentPrompt, ai: true }
          : { value: action.content, ai: false },
      to:
        typeof action.toPrompt === "string"
          ? { value: action.toPrompt, ai: true }
          : { value: action.to, ai: false },
      cc:
        typeof action.ccPrompt === "string"
          ? { value: action.ccPrompt, ai: true }
          : { value: action.cc, ai: false },
      bcc:
        typeof action.bccPrompt === "string"
          ? { value: action.bccPrompt, ai: true }
          : { value: action.bcc, ai: false },
    })),
    categoryFilters: rule.categoryFilters.map((category) => category.id),
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
