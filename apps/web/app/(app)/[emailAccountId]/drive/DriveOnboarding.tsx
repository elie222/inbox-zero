"use client";

import { Card } from "@/components/ui/card";
import { TypographyH3, TypographyH4 } from "@/components/Typography";
import { ConnectDrive } from "./ConnectDrive";

const steps = [
  {
    number: 1,
    title: "Tell us how you organize",
    description: '"Receipts go to Expenses by month. Contracts go to Legal."',
  },
  {
    number: 2,
    title: "Attachments get filed",
    description: "AI reads each document and files it to the right folder",
  },
  {
    number: 3,
    title: "You stay in control",
    description: "Get an email when files are sorted—reply to correct",
  },
];

export function DriveOnboarding() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <TypographyH3 className="text-center">
        Attachments filed automatically while you work
      </TypographyH3>

      <div className="mt-10 space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {step.number}
            </div>
            <div>
              <p className="font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-10 p-6">
        <div className="text-center">
          <TypographyH4>Where should we file your attachments?</TypographyH4>
          <div className="mt-4 flex justify-center">
            <ConnectDrive />
          </div>
        </div>
      </Card>
    </div>
  );
}
