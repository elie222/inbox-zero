import Image from "next/image";
import { TypographyH3 } from "@/components/Typography";
import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";

interface ConfirmationStepProps {
  estimatedTime: string;
  onStart: () => void;
}

export function ConfirmationStep({
  estimatedTime,
  onStart,
}: ConfirmationStepProps) {
  return (
    <div className="text-center">
      <Image
        src="/images/illustrations/communication.svg"
        alt="clean up"
        width={150}
        height={150}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <TypographyH3 className="mt-2">Ready to clean up your inbox</TypographyH3>

      <SectionDescription className="mx-auto mt-4 max-w-prose">
        We'll run through 20 emails first as a test run. The full process can
        take approximately {estimatedTime} to clean up your inbox.
      </SectionDescription>

      <SectionDescription className="mx-auto mt-4 max-w-prose">
        All emails will be labeled as "Cleaned" so it's easy to revert if
        needed. We don't delete any emails, and any archived emails can easily
        be found in search.
      </SectionDescription>

      <div className="mt-6">
        <Button onClick={onStart}>Start Cleaning</Button>
      </div>
    </div>
  );
}
