import { Rule } from "@/app/(app)/[emailAccountId]/assistant/RuleForm";
import { TopSection } from "@/components/TopSection";

export default async function RulePage(props: {
  params: Promise<{ ruleId: string; account: string }>;
  searchParams: Promise<{ new: string }>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

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
        <Rule ruleId={params.ruleId} />
      </div>
    </div>
  );
}
