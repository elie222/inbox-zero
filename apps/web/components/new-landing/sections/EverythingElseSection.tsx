import { Button } from "@/components/new-landing/common/Button";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import { DisplayCard } from "@/components/new-landing/common/DisplayCard";
import { Section } from "@/components/new-landing/common/Section";
import { Analytics } from "@/components/new-landing/icons/Analytics";
import { ChatTwo } from "@/components/new-landing/icons/ChatTwo";
import { Link } from "@/components/new-landing/icons/Link";
import Image from "next/image";

export function EverythingElseSection() {
  return (
    <Section
      title="And everything else you need"
      subtitle="Effortless setup with one-click install. Inboxzero is intuitive and requires no technical skills."
      childrenMarginTop="mt-5"
    >
      <div className="flex flex-col items-center gap-5 lg:px-10">
        <CardWrapper padding="xs" rounded="xs" variant="dark-border">
          <Button>Get started free</Button>
        </CardWrapper>
        <CardWrapper className="w-full grid md:grid-cols-3 gap-5">
          <DisplayCard
            title="Measure what matters with email analytics"
            description="See who emails you most and what's clogging your inbox. Get clear insights, then take action."
            icon={<Analytics />}
          >
            <Image
              src="/images/new-landing/metrics.svg"
              alt="metrics"
              width={1000}
              height={400}
            />
          </DisplayCard>
          <DisplayCard
            title="Drafts that know your schedule"
            description="Connects to your calendar, CRM, and tools to draft emails based on your actual schedule and customer data."
            icon={<Link />}
          >
            <Image
              src="/images/new-landing/integrations.svg"
              alt="analytics"
              width={1000}
              height={400}
            />
          </DisplayCard>
          <DisplayCard
            title="Customize your assistant in plain English"
            description="Every inbox is different. Set your own rules in seconds using everyday language."
            icon={<ChatTwo />}
          >
            <Image
              src="/images/new-landing/create-rules.svg"
              alt="analytics"
              width={1000}
              height={400}
            />
          </DisplayCard>
        </CardWrapper>
      </div>
    </Section>
  );
}
