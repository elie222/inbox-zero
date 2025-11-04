import { Section } from "@/components/new-landing/common/Section";
import Image from "next/image";

export function BulkUnsubscribe() {
  return (
    <Section
      title="Bulk unsubscribe from emails you never read"
      subtitle="See which emails you never read, and one-click unsubscribe and archive them."
    >
      <Image
        src="/images/new-landing/bulk-unsubscribe.svg"
        alt="bulk unsubscribe"
        width={700}
        height={1000}
      />
    </Section>
  );
}
