import { Section } from "@/components/new-landing/common/Section";
import Image from "next/image";

export function OrganizedInbox() {
  return (
    <Section
      title="An organized inbox so you never miss an important email"
      subtitle="Drowning in emails? Don't waste any more valuable brain energy trying to prioritize your emails. Our AI assistant will label everything automatically."
      wrap
    >
      <Image
        src="/images/new-landing/an-organized-inbox.svg"
        alt="an organized inbox"
        width={1000}
        height={1000}
      />
    </Section>
  );
}
