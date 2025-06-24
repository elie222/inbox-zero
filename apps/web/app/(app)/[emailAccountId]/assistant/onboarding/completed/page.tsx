"use client";

import { use } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { TypographyH3, TypographyP } from "@/components/Typography";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prefixPath } from "@/utils/path";

export default function CompletedPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = use(props.params);
  return (
    <div>
      <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>

          <TypographyH3>You're all set!</TypographyH3>

          <div className="mt-6 space-y-4">
            <TypographyP>
              Your emails will be automatically categorized.
            </TypographyP>

            <TypographyP>
              Want to customize further? You can update your rules on the
              Assistant page and fine-tune your preferences anytime.
            </TypographyP>
          </div>

          <div className="mt-8 flex flex-col gap-4">
            <Button size="lg" asChild>
              <Link href={prefixPath(emailAccountId, "/automation")}>
                Go to Assistant
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
