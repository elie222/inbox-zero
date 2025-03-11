"use client";

import Image from "next/image";
import Link from "next/link";
import { SectionDescription } from "@/components/Typography";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useStep } from "@/app/(app)/clean/useStep";
import { env } from "@/env";

export function IntroStep({ unreadCount }: { unreadCount: number }) {
  const { onNext } = useStep();

  const isAssistantEnabled = !!env.NEXT_PUBLIC_ELEVENLABS_CLEANER_AGENT_ID;

  return (
    <div className="text-center">
      <Image
        src="https://illustrations.popsy.co/amber/home-office.svg"
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
          {isAssistantEnabled && (
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              Take a call with our AI to get set up, or set up manually.
            </SectionDescription>
          )}
        </>
      )}

      <div className="mt-6 flex items-center justify-center gap-2">
        {isAssistantEnabled ? (
          <>
            <Button onClick={onNext} disabled={unreadCount === null}>
              Set up myself
            </Button>
            <Button asChild variant="outline">
              <Link href="/clean/assistant">Set up via assistant</Link>
            </Button>
          </>
        ) : (
          <Button onClick={onNext} disabled={unreadCount === null}>
            Got it
          </Button>
        )}
      </div>
    </div>
  );
}
