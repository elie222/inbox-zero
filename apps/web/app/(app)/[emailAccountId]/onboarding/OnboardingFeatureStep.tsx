import type { ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";

export function OnboardingFeatureStep({
  illustration,
  title,
  description,
  onNext,
}: {
  illustration: ReactNode;
  title: string;
  description: string;
  onNext: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-4 py-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-[240px] items-end justify-center">
          {illustration}
        </div>
        <PageHeading className="mb-3">{title}</PageHeading>
        <TypographyP className="mb-8 text-muted-foreground">
          {description}
        </TypographyP>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
