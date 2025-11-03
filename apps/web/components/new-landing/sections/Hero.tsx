import Image from "next/image";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import { Section } from "@/components/new-landing/common/Section";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { CallToAction } from "@/components/new-landing/CallToAction";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { Play } from "@/components/new-landing/icons/Play";

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
          <Paragraph variant="light" className="text-sm">
            Try for free with one click
          </Paragraph>
          <CallToAction />
          <div className="flex items-center gap-2 justify-center">
            <Paragraph variant="light" className="text-sm">
              Works with
            </Paragraph>
            <Outlook />
            <Gmail />
          </div>
        </div>
        <div className="relative">
          <LiquidGlassButton className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Play />
          </LiquidGlassButton>
          <Image
            src="/images/new-landing/video-thumbnail.svg"
            alt="an organized inbox"
            width={1000}
            height={1000}
          />
        </div>
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
