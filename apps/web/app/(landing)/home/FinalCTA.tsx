import { CallToAction } from "@/components/new-landing/CallToAction";
import { PatternBanner } from "@/components/new-landing/PatternBanner";
import { BRAND_NAME } from "@/utils/branding";

export function FinalCTA() {
  return (
    <PatternBanner
      title={
        <>
          Get back an hour a day.
          <br />
          {`Start using ${BRAND_NAME}.`}
        </>
      }
      subtitle="Less time in your inbox. More time for what actually matters."
    >
      <CallToAction
        text="Get started for free"
        buttonSize="lg"
        className="mt-6"
      />
    </PatternBanner>
  );
}
