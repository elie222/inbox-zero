import { Button } from "@/app/(landing)/new-landing/Button";
import { Card } from "@/app/(landing)/new-landing/Card";
import { CardWrapper } from "@/app/(landing)/new-landing/CardWrapper";
import { Section } from "@/app/(landing)/new-landing/Section";

const plans = [
  {
    title: "Starter",
    description:
      "For individuals and entrepreneurs looking to buy back their time.",
  },
  {
    title: "Enterprise",
    description:
      "For organizations with enterprise-grade security requirements.",
  },
  {
    title: "Professional",
    description:
      "For teams and growing businesses handling high email volumes.",
  },
];

export function Pricing() {
  return (
    <Section
      title="Try for free, affordable paid plans"
      subtitle="No hidden fees. Cancel anytime."
    >
      <div className="flex gap-6">
        {plans.map(({ title, description }) => (
          <CardWrapper key={title}>
            <Card noPadding>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">{title}</h2>
                  <p className="text-gray-500">{description}</p>
                </div>
                <div className="flex gap-2 items-end">
                  <h1 className="text-4xl font-bold">$18</h1>
                  <p className="text-gray-400 text-xs -translate-y-1">
                    /user /month (billed annually)
                  </p>
                </div>
                <Button className="w-full">Try free for 7 days</Button>
              </div>
              <div className="p-6 border-t border-[#E7E7E780]">a</div>
            </Card>
          </CardWrapper>
        ))}
      </div>
    </Section>
  );
}
