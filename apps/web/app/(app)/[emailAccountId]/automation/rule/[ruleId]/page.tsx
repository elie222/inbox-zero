import prisma from "@/utils/prisma";
import { RuleForm } from "@/app/(app)/[emailAccountId]/automation/RuleForm";
import { TopSection } from "@/components/TopSection";
import { hasVariables } from "@/utils/template";
import { getConditions } from "@/utils/condition";

export default async function RulePage(props: {
  params: Promise<{ ruleId: string; account: string }>;
  searchParams: Promise<{ new: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const rule = await prisma.rule.findUnique({
    where: { id: params.ruleId, emailAccount: { accountId: params.account } },
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
        ai: hasVariables(action.label),
      },
      subject: { value: action.subject },
      content: { value: action.content },
      to: { value: action.to },
      cc: { value: action.cc },
      bcc: { value: action.bcc },
      url: { value: action.url },
    })),
    categoryFilters: rule.categoryFilters.map((category) => category.id),
    conditions: getConditions(rule),
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
