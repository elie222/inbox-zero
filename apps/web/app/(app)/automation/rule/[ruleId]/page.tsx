import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { UpdateRuleForm } from "@/app/(app)/automation/RuleModal";
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

  return (
    <div>
      {searchParams.new === "true" && (
        <TopSection
          title="Here are your rule settings!"
          descriptionComponent={
            <>
              <p>
                These rules were AI generated, feel free to adjust them to your
                needs.
              </p>
            </>
          }
        />
      )}
      <div className="max-w-3xl px-4 sm:px-6 lg:px-8">
        <UpdateRuleForm rule={rule} />
      </div>
    </div>
  );
}
