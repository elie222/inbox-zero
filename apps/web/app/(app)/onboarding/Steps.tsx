"use client";

import { useRouter } from "next/navigation";
import { PlayCircleIcon } from "lucide-react";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

export function Steps({
  steps,
}: {
  steps: {
    title: string;
    description: string;
    content: React.ReactNode;
    videoUrl?: string;
    active: boolean;
  }[];
}) {
  const router = useRouter();

  return (
    <ul role="list" className="space-y-6">
      {steps.map((step, stepIdx) => (
        <li
          key={stepIdx}
          className="relative flex gap-x-4"
          onClick={
            !step.active
              ? () => {
                  router.replace(`/onboarding?step=${stepIdx + 1}`, {
                    scroll: false,
                  });
                }
              : undefined
          }
        >
          <div
            className={cn(
              stepIdx === steps.length - 1 ? "h-6" : "-bottom-6",
              "absolute left-0 top-0 flex w-6 justify-center",
            )}
          >
            <div className="w-px bg-gray-200" />
          </div>

          <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-white">
            <div className="h-1.5 w-1.5 rounded-full bg-gray-100 ring-1 ring-gray-300" />
          </div>

          <div
            className={cn(
              "flex-1 transition-opacity duration-300 ease-in-out",
              step.active ? "opacity-100" : "opacity-30",
            )}
          >
            <div className="flex justify-between gap-4">
              <div>
                <TypographyH3>{step.title}</TypographyH3>
                <SectionDescription>{step.description}</SectionDescription>
              </div>

              <div className="flex items-center">
                {step.videoUrl && (
                  <Button
                    variant="outline"
                    onClick={() => window.open(step.videoUrl, "_blank")}
                  >
                    <PlayCircleIcon className="mr-2 size-4" />
                    Watch video
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4">{step.content}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
