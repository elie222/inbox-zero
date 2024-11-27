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
      label: {
        value: action.label,
        ai: /\{\{.*?\}\}/g.test(action.label || ""),
      },
      subject: { value: action.subject },
      content: { value: action.content },
      to: { value: action.to },
      cc: { value: action.cc },
      bcc: { value: action.bcc },
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
