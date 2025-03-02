import Image from "next/image";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";

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

      <ul className="mx-auto mt-4 max-w-prose list-disc space-y-2 pl-4 text-left">
        <li>We'll start with 20 emails as a test run</li>
        <li>Full process takes approximately {estimatedTime}</li>
        <li>
          All emails will be labeled as <Badge color="green">Cleaned</Badge>
        </li>
        <li>No emails are deleted - everything can be found in search</li>
      </ul>

      <div className="mt-6">
        <Button onClick={onStart}>Start Cleaning</Button>
      </div>
    </div>
  );
}
