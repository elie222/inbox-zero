import { Button } from "@/app/(landing)/new-landing/Button";
import { Section } from "./Section";
import Image from "next/image";
import { Gmail } from "@/app/(landing)/new-landing/Gmail";
import { Outlook } from "@/app/(landing)/new-landing/Outlook";
import { Paragraph } from "@/app/(landing)/new-landing/Typography";

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
          <div className="flex items-center gap-4 justify-center">
            <Button>Get started</Button>
            <Paragraph className="text-sm">or</Paragraph>
            <Button variant="secondary">Talk to sales</Button>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Paragraph variant="light" className="text-sm">
              Works with
            </Paragraph>
            <Outlook />
            <Gmail />
          </div>
        </div>
        <Image
          src="/images/new-landing/video-thumbnail.svg"
          alt="an organized inbox"
          width={1000}
          height={1000}
        />
      </div>
    </Section>
  );
}
