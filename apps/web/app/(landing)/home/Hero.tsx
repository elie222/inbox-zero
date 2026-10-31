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
import { HeroReveal } from "@/components/new-landing/common/HeroReveal";
import { UnicornScene } from "@/components/new-landing/UnicornScene";
import {
  Badge,
  type BadgeVariant,
} from "@/components/new-landing/common/Badge";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { HeroVideoDialog } from "@/app/(landing)/home/HeroVideoDialog";

interface HeroProps {
  badge?: React.ReactNode;
  badgeVariant?: BadgeVariant;
  children?: React.ReactNode;
  cta?: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
}

export function Hero({
  title,
  subtitle,
  badge,
  badgeVariant = "blue",
  children,
  cta,
  icon,
}: HeroProps) {
  return (
    <Section className={badge || icon ? "mt-7 md:mt-7" : "mt-10 md:mt-20"}>
      {icon ? (
        <HeroReveal className="mb-7 flex justify-center">{icon}</HeroReveal>
      ) : null}
      {badge ? (
        <HeroReveal className="mb-7 flex justify-center">
          <Badge variant={badgeVariant}>{badge}</Badge>
        </HeroReveal>
      ) : null}
      <PageHeading>{title}</PageHeading>
      <HeroReveal delay={0.125 * 5}>
        <Paragraph size="lg" className="mx-auto mt-6 max-w-[640px]">
          {subtitle}
        </Paragraph>
      </HeroReveal>
      <SectionContent noMarginTop className="mt-6 md:mt-8">
        <div className="mb-8 space-y-3">
          <HeroReveal delay={0.125 * 7}>{cta ?? <CallToAction />}</HeroReveal>
          <HeroReveal delay={0.125 * 8}>
            <div className="mb-12 flex items-center justify-center gap-2">
              <Paragraph color="light" size="sm">
                Works with
              </Paragraph>
              <Outlook />
              <Gmail />
            </div>
          </HeroReveal>
        </div>
        {children}
      </SectionContent>
    </Section>
  );
}

export function HeroVideoPlayer({ video }: { video?: HeroVideo }) {
  const thumbnail = getThumbnail(video);

  return (
    <HeroReveal className="relative w-full" delay={0.125 * 9}>
      <div className="relative block overflow-hidden rounded-3xl border border-[#EFEFEF] md:rounded-[43px]">
        <HeroVideoDialog
          playbackId={video?.muxPlaybackId}
          thumbnailTime={video?.thumbnailTime}
          title={video?.title}
        />
        <Image
          src={thumbnail.src}
          alt={video?.title ?? "an organized inbox"}
          width={thumbnail.width}
          height={thumbnail.height}
          sizes="(min-width: 1280px) 1152px, (min-width: 1024px) calc(100vw - 64px), calc(100vw - 48px)"
          preload
          className="h-auto w-full"
        />
        <UnicornScene className="h-[calc(100%+5px)] opacity-30" />
      </div>
    </HeroReveal>
  );
}

export function HeroContent() {
  return (
    <>
      <BrandScroller />
      <HeroVideoPlayer />
    </>
  );
}

type HeroVideo = {
  muxPlaybackId: string;
  thumbnailTime?: number;
  thumbnail?: { src: string; width: number; height: number };
  title: string;
};

function getThumbnail(video?: HeroVideo) {
  if (video?.thumbnail) return video.thumbnail;
  if (video?.thumbnailTime !== undefined) {
    return {
      src: `https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?time=${video.thumbnailTime}&width=2560`,
      width: 2560,
      height: 1440,
    };
  }
  return {
    src: "/images/new-landing/video-thumbnail.webp",
    width: 2560,
    height: 1404,
  };
}
