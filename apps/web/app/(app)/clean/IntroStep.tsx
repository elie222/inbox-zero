import Image from "next/image";
import { SectionDescription } from "@/components/Typography";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";

interface IntroStepProps {
  unreadCount: number | null;
  onNext: () => void;
}

export function IntroStep({ unreadCount, onNext }: IntroStepProps) {
  return (
    <div className="text-center">
      <Image
        src="/images/illustrations/communication.svg"
        alt="clean up"
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <TypographyH3 className="mt-2">
        Let's get your inbox cleaned up in 5 minutes
      </TypographyH3>

      {unreadCount === null ? (
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          Checking your inbox...
        </SectionDescription>
      ) : (
        <>
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            You have {unreadCount.toLocaleString()} emails in your inbox.
          </SectionDescription>
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            We'd like to archive them all, but we want to make sure we don't
            archive anything important.
          </SectionDescription>
        </>
      )}

      <div className="mt-6">
        <Button onClick={onNext} disabled={unreadCount === null}>
          Got it
        </Button>
      </div>
    </div>
  );
}
