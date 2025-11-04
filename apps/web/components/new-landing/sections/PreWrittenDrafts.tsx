import { Section } from "@/components/new-landing/common/Section";
import Image from "next/image";

export function PreWrittenDrafts() {
  return (
    <Section
      title="Pre-written drafts waiting in your inbox"
      subtitle="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
    >
      <div className="mx-20">
        <Image
          src="/images/new-landing/pre-written-drafts.svg"
          alt="pre-written drafts"
          width={1000}
          height={1000}
        />
      </div>
    </Section>
  );
}
