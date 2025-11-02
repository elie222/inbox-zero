import { Button } from "@/app/(landing)/new-landing/Button";
import { Section } from "./Section";
import Image from "next/image";
import { Gmail } from "@/app/(landing)/new-landing/Gmail";
import { Outlook } from "@/app/(landing)/new-landing/Outlook";

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
          <p className="text-gray-400 text-sm">Try for free with one click</p>
          <div className="flex items-center gap-4 justify-center">
            <Button>Get started</Button>
            <p className="text-gray-500 text-sm">or</p>
            <Button variant="secondary">Talk to sales</Button>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <p className="text-gray-400 text-sm">Works with</p>
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
