import { CallToAction } from "@/components/new-landing/CallToAction";
import { Section } from "@/components/new-landing/common/Section";

export function BuyBackTime() {
  return (
    <div
      className="bg-[url('/images/new-landing/buy-back-time-bg.png')] bg-cover bg-center bg-no-repeat"
      style={{ backgroundPosition: "center 44%" }}
    >
      <Section
        title="Buy back your time"
        subtitle="Stop wasting half your day on email. Start using Inbox Zero today."
        noGap
      >
        <CallToAction text="Get started for free" className="mt-6" />
      </Section>
    </div>
  );
}
