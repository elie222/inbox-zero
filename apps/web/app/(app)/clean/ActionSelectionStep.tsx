import { TypographyH3 } from "@/components/Typography";
import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import type { EmailAction } from "@/app/(app)/clean/types";

interface ActionSelectionStepProps {
  onActionSelect: (action: EmailAction) => void;
}

export function ActionSelectionStep({
  onActionSelect,
}: ActionSelectionStepProps) {
  return (
    <div className="text-center">
      <TypographyH3 className="mb-4">
        How would you like to handle your emails?
      </TypographyH3>

      <SectionDescription className="mx-auto mb-6 max-w-prose">
        Choose how you'd like to process the emails in your inbox.
      </SectionDescription>

      <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
        <Button
          variant="default"
          size="lg"
          onClick={() => onActionSelect("archive")}
          className="flex-1 sm:max-w-40"
        >
          Archive (Recommended)
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => onActionSelect("mark-read")}
          className="flex-1 sm:max-w-40"
        >
          Mark as Read
        </Button>
      </div>
    </div>
  );
}
