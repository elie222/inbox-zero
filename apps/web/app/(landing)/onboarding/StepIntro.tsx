"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardBasic } from "@/components/ui/card";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(landing)/onboarding/IconCircle";

export function StepIntro() {
  return (
    <div>
      <IconCircle size="lg" className="mx-auto">
        <MailIcon className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>Get to know Inbox Zero</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          Here are the basics of Inbox Zero. We'll take you through the steps to
          get you started and set you up for success.
        </TypographyP>
      </div>
      <div className="mt-8">
        <div className="grid gap-8">
          <Benefit
            index={1}
            title="Emails sorted automatically"
            description="Emails are automatically organized into categories like 'To Reply', 'Newsletters', and 'Cold Emails'. You can create any categories you want."
            image="/images/onboarding/newsletters.png"
          />
          <Benefit
            index={2}
            title="Pre-drafted replies"
            description="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
            image="/images/onboarding/draft.png"
          />
          <Benefit
            index={3}
            title="Daily digest"
            description="Get a beautiful daily email summarizing everything you need to read but don't need to respond to. Read your inbox in 30 seconds instead of 30 minutes."
            image="/images/onboarding/digest.png"
          />
        </div>
        <div className="flex justify-center mt-8">
          <Button asChild size="sm" variant="primaryBlue">
            <Link href="/onboarding?step=2">
              Continue <ArrowRightIcon className="size-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Benefit({
  index,
  title,
  description,
  image,
}: {
  index: number;
  title: string;
  description: string;
  image: string;
}) {
  return (
    <CardBasic className="rounded-2xl shadow-none grid grid-cols-5 p-0 pl-4 pt-4 gap-8 h-[50vh]">
      <div className="flex items-center gap-4 col-span-2">
        <IconCircle>{index}</IconCircle>
        <div>
          <div className="font-semibold text-xl">{title}</div>
          <div className="text-sm text-muted-foreground mt-1 leading-6">
            <p>{description}</p>
          </div>
        </div>
      </div>
      <div className="col-span-3 text-sm text-muted-foreground rounded-tl-2xl pl-4 pt-4 bg-slate-50 border-t border-l border-slate-200 overflow-hidden">
        <Image
          src={image}
          alt="Benefit"
          width={700}
          height={700}
          className="w-full h-full object-left-top object-cover rounded-tl-xl border-t border-l border-slate-200"
        />
      </div>
    </CardBasic>
  );
}
