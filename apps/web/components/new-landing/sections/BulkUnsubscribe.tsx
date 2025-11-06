import Image from "next/image";
import { Section } from "@/components/new-landing/common/Section";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";

export function BulkUnsubscribe() {
  return (
    <Section
      title="Bulk unsubscribe from emails you never read"
      subtitle="See which emails you never read, and one-click unsubscribe and archive them."
    >
      <div className="flex justify-center items-center">
        <CardWrapper
          padding="xs"
          rounded="md"
          className="hidden md:block md:mx-20 lg:mx-40"
        >
          <Image
            src="/images/new-landing/bulk-unsubscribe.svg"
            alt="bulk unsubscribe"
            width={1000}
            height={1000}
          />
        </CardWrapper>
        <CardWrapper padding="xs" rounded="md" className="block md:hidden">
          <Image
            src="/images/new-landing/bulk-unsubscribe-mobile.svg"
            alt="bulk unsubscribe"
            width={1000}
            height={1000}
          />
        </CardWrapper>
      </div>
    </Section>
  );
}
