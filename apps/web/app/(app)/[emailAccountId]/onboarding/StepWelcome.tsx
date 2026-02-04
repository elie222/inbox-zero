"use client";

import { motion } from "framer-motion";
import { ArrowRightIcon, MailIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 1.5 }}
            animate={{ opacity: 1, scale: 1.8 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <IconCircle size="lg">
              <MailIcon className="size-6" />
            </IconCircle>
          </motion.div>
        </div>

        <PageHeading className="mb-3">Get to know Inbox Zero</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          We'll take you through the steps to get you started and set you up for
          success.
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
