import { Trans, useLingui } from "@lingui/react/macro";
import { CallToAction } from "@/components/new-landing/CallToAction";
import { PatternBanner } from "@/components/new-landing/PatternBanner";
import { BRAND_NAME } from "@/utils/branding";

export function FinalCTA() {
  const { t } = useLingui();

  return (
    <PatternBanner
      title={
        <Trans>
          Get back an hour a day.
          <br />
          Start using {BRAND_NAME}.
        </Trans>
      }
      subtitle={t`Less time in your inbox. More time for what actually matters.`}
    >
      <CallToAction
        text={t`Get started for free`}
        buttonSize="lg"
        className="mt-6"
      />
    </PatternBanner>
  );
}
