"use client";

import Image from "next/image";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import { Section } from "@/components/new-landing/common/Section";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { CallToAction } from "@/components/new-landing/CallToAction";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { Play } from "@/components/new-landing/icons/Play";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Hero() {
  return (
    <Section
      variant="hero"
      title={
        <span>
          Meet your AI email assistant that <em>actually</em> works
        </span>
      }
      subtitle="Inbox Zero organizes your inbox, drafts replies in your voice, and helps you reach inbox zero fast. Never miss an important email again."
      wrap
    >
      <div>
        <div className="space-y-3 mb-8">
          <Paragraph color="light" size="sm">
            Try for free with one click
          </Paragraph>
          <CallToAction />
          <div className="flex items-center gap-2 justify-center">
            <Paragraph color="light" size="sm">
              Works with
            </Paragraph>
            <Outlook />
            <Gmail />
          </div>
        </div>
        <HeroVideoPlayer />
        <div className="mt-12">
          <Paragraph>
            Join over 15,000 users worldwide saving hours daily
          </Paragraph>
          <Image
            src="/images/new-landing/trusted-by.png"
            alt="logo cloud"
            width={1000}
            height={1000}
          />
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
