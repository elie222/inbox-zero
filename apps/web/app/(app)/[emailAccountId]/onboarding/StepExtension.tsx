"use client";

import { ChromeIcon, MailsIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { ContinueButtonLink } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { Button } from "@/components/ui/button";
import { OnboardingImagePreview } from "@/app/(app)/[emailAccountId]/onboarding/ImagePreview";

export function StepExtension() {
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
            still in your inbox.
            <br />
            See only emails needing replies, or see only newsletters and archive
            all (or mark as read) in one click.
          </TypographyP>
        </div>

        <div className="flex justify-center mt-8">
          <Button asChild size="sm">
            <a
              href="https://go.getinboxzero.com/extension"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ChromeIcon className="size-4 mr-2" />
              Install Extension
            </a>
          </Button>
        </div>

        <div className="flex justify-center mt-8">
          <ContinueButtonLink href="/welcome-upgrade" />
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
