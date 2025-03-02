import { ArchiveIcon, MailIcon } from "lucide-react";
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
      <TypographyH3 className="mx-auto max-w-lg">
        Would you like cleaned emails to be archived or marked as read?
      </TypographyH3>

      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="outline"
          onClick={() => onActionSelect("archive")}
          Icon={ArchiveIcon}
        >
          Archive (Recommended)
        </Button>
        <Button
          variant="outline"
          onClick={() => onActionSelect("mark-read")}
          Icon={MailIcon}
        >
          Mark as Read
        </Button>
      </div>
    </div>
  );
}
