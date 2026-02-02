"use client";

import Image from "next/image";
import { ArrowRightIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-center justify-center">
          <Image
            src="/icons/icon-192x192.png"
            alt="Inbox Zero app icon"
            width={192}
            height={192}
            priority
            className="h-24 w-24 animate-in fade-in zoom-in-50 duration-700"
          />
        </div>

        <PageHeading className="mb-3">Welcome to Inbox Zero</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          Meet Inbox Zero - your email assistant. We'll sort your inbox, draft
          replies, and keep follow-ups on track. In a few quick steps, you'll be
          set up and ready to go.
        </TypographyP>

        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
