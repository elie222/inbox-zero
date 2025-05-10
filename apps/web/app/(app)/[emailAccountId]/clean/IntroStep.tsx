"use client";

import Image from "next/image";
import { SectionDescription } from "@/components/Typography";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { CleanAction } from "@prisma/client";

export function IntroStep({
  unhandledCount,
  cleanAction,
}: {
  unhandledCount: number;
  cleanAction: CleanAction;
}) {
  const { onNext } = useStep();

  return (
    <div className="text-center">
      <Image
        src="/images/illustrations/home-office.svg"
        alt="clean up"
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <TypographyH3 className="mt-2">
        Let's get your inbox cleaned up in 5 minutes
      </TypographyH3>

      {unhandledCount === null ? (
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          Checking your inbox...
        </SectionDescription>
      ) : (
        <>
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            You have {unhandledCount.toLocaleString()}{" "}
            {cleanAction === CleanAction.ARCHIVE ? "unarchived" : "unread"}{" "}
            emails in your inbox.
          </SectionDescription>
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            Let's clean up your inbox while keeping important emails safe.
          </SectionDescription>
        </>
      )}

      <div className="mt-6">
        <Button onClick={onNext} disabled={unhandledCount === null}>
          Next
        </Button>
      </div>
    </div>
  );
}
