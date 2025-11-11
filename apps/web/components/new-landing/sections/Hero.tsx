"use client";

import Image from "next/image";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { CallToAction } from "@/components/new-landing/CallToAction";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { Play } from "@/components/new-landing/icons/Play";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { WordReveal } from "@/components/new-landing/common/WordReveal";
import { userMinCount } from "@/utils/config";
import { UnicornScene } from "@/components/new-landing/UnicornScene";

export function Hero() {
  return (
    <Section className="mt-20">
      <PageHeading>
        <WordReveal
          duration={0.04}
          words={[
            "Meet",
            "your",
            "AI",
            "email",
            "assistant",
            "that",
            <em key="actually">actually</em>,
            "works",
          ]}
        />
      </PageHeading>
      <BlurFade duration={0.4} delay={0.125 * 4} inView>
        <Paragraph size="lg" className={"max-w-[640px] mx-auto mt-6"}>
          Inbox Zero organizes your inbox, drafts replies in your voice, and
          helps you reach inbox zero fast. Never miss an important email again.
        </Paragraph>
      </BlurFade>
      <SectionContent>
        <div className="space-y-3 mb-8">
          <BlurFade duration={0.4} delay={0.125 * 6} inView>
            <CallToAction />
          </BlurFade>
          <BlurFade duration={0.4} delay={0.125 * 7} inView>
            <div className="mb-12 flex items-center gap-2 justify-center">
              <Paragraph color="light" size="sm">
                Works with
              </Paragraph>
              <Outlook />
              <Gmail />
            </div>
          </BlurFade>
        </div>
        <BlurFade delay={0.125 * 8} inView>
          <HeroVideoPlayer />
        </BlurFade>
        <div className="mt-12">
          <Paragraph>
            Join over {userMinCount} users worldwide saving hours daily
          </Paragraph>
          <BrandScroller />
        </div>
      </SectionContent>
    </Section>
  );
}

export function HeroVideoPlayer() {
  return (
    <div className="relative w-full">
      <div className="relative border border-[#EFEFEF] rounded-[43px] overflow-hidden block">
        <Dialog>
          <DialogTrigger asChild>
            <LiquidGlassButton className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Play />
            </LiquidGlassButton>
          </DialogTrigger>
          <DialogContent className="max-w-4xl border-0 bg-transparent p-0">
            <DialogTitle className="sr-only">Video player</DialogTitle>
            <div className="relative aspect-video w-full">
              <iframe
                src="https://www.youtube.com/embed/hfvKvTHBjG0?autoplay=1&rel=0"
                className="size-full rounded-lg"
                title="Video content"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              />
            </div>
          </DialogContent>
        </Dialog>
        <Image
          src="/images/new-landing/video-thumbnail-transparent.png"
          // src="/images/new-landing/video-thumbnail.png"
          alt="an organized inbox"
          width={2000}
          height={1000}
          className="w-full"
        />
        <UnicornScene className="h-[calc(100%+1px)] opacity-30" />
      </div>
    </div>
  );
}
