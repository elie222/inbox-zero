import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { initLingui } from "@/utils/i18n/server";
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
  const i18n = await initLingui();

  return (
    <div>
      {searchParams.new === "true" && (
        <TopSection
          title={t(i18n)`Here are your rule settings!`}
          descriptionComponent={
            <p>
              <Trans>
                These rules were AI generated, feel free to adjust them to your
                needs.
              </Trans>
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
