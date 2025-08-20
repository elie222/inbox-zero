"use client";

import { useState } from "react";
import { ArrowRightIcon, ChromeIcon, MailsIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { Button } from "@/components/ui/button";
import { OnboardingImagePreview } from "@/app/(app)/[emailAccountId]/onboarding/ImagePreview";
import { EXTENSION_URL } from "@/utils/config";

export function StepExtension({ onNext }: { onNext: () => Promise<void> }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="grid xl:grid-cols-2">
      <OnboardingWrapper className="py-0">
        <IconCircle size="lg" className="mx-auto">
          <MailsIcon className="size-6" />
        </IconCircle>

        <div className="text-center mt-4">
          <PageHeading>Install the Inbox Zero Tabs extension</PageHeading>
          <TypographyP className="mt-2 max-w-lg mx-auto">
            Add tabs to Gmail that show only <strong>unhandled emails</strong>{" "}
            by label.
            <br />
            See only emails needing replies, or see only newsletters and archive
            all (or mark as read) in one click.
          </TypographyP>
        </div>

        <div className="flex justify-center mt-8">
          <Button asChild size="sm" variant="primaryBlue">
            <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer">
              <ChromeIcon className="size-4 mr-2" />
              Install Extension
            </a>
          </Button>
        </div>

        <div className="flex justify-center mt-8">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              setIsLoading(true);
              onNext().finally(() => {
                setIsLoading(false);
              });
            }}
            loading={isLoading}
          >
            Skip for now <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      </OnboardingWrapper>

      <div className="fixed top-0 right-0 w-1/2 bg-white h-screen items-center justify-center hidden xl:flex">
        <OnboardingImagePreview
          src="/images/onboarding/extension.png"
          alt="Inbox Zero Tabs Extension"
          width={672}
          height={1200}
        />
      </div>
    </div>
  );
}
