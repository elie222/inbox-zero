"use client";

import Image from "next/image";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import { Section } from "@/components/new-landing/common/Section";
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

export function Hero() {
  return (
    <Section>
      <PageHeading>
        Meet your AI email assistant that <em>actually</em> works
      </PageHeading>
      <Paragraph className={"max-w-[650px] mx-auto mt-4"}>
        Inbox Zero organizes your inbox, drafts replies in your voice, and helps
        you reach inbox zero fast. Never miss an important email again.
      </Paragraph>
      <div>
        <div className="space-y-3 mb-8">
          <BlurFade delay={0.25} inView>
            <Paragraph color="light" size="sm">
              Try for free with one click
            </Paragraph>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <CallToAction />
          </BlurFade>
          <BlurFade delay={0.25 * 3} inView>
            <div className="flex items-center gap-2 justify-center">
              <Paragraph color="light" size="sm">
                Works with
              </Paragraph>
              <Outlook />
              <Gmail />
            </div>
          </BlurFade>
        </div>
        <BlurFade delay={0.25 * 6} inView>
          <HeroVideoPlayer />
        </BlurFade>
        <div className="mt-12">
          <Paragraph>
            Join over 15,000 users worldwide saving hours daily
          </Paragraph>
          <BrandScroller />
        </div>
      </div>
    </Section>
  );
}

export function HeroVideoPlayer() {
  return (
    <div className="relative w-full">
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
        src="/images/new-landing/video-thumbnail.png"
        alt="an organized inbox"
        width={1000}
        height={1000}
        className="w-full"
      />
    </div>
  );
}
