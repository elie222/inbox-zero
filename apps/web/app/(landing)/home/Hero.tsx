import Link from "next/link";
import Image from "next/image";
import { CTAButtons } from "@/app/(landing)/home/CTAButtons";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { cn } from "@/utils";
import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { env } from "@/env";
import { HeroAB } from "@/app/(landing)/home/HeroAB";
import HeroVideoDialog from "@/components/HeroVideoDialog";

export function HeroText(props: {
  children: React.ReactNode;
  className?: string;
}) {
  const { className, ...rest } = props;

  return (
    <h1
      className={cn("font-cal text-4xl text-gray-900 sm:text-6xl", className)}
      {...rest}
    />
  );
}

export function HeroSubtitle(props: { children: React.ReactNode }) {
  return <p className="mt-6 text-lg leading-8 text-gray-600" {...props} />;
}

export function HeroHome() {
  if (env.NEXT_PUBLIC_POSTHOG_HERO_AB) return <HeroAB />;
  return <Hero />;
}

export function Hero(props: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  image?: string;
  CTAComponent?: React.ComponentType;
  hideProductHuntBadge?: boolean;
  video?: React.ReactNode;
}) {
  const CTAComponent = props.CTAComponent || CTAButtons;

  return (
    <div className="relative pt-14">
      <SquaresPattern />
      <div className="pt-24 sm:pb-12 sm:pt-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {!props.hideProductHuntBadge && (
            <div className="mb-10 flex flex-col items-center justify-center gap-4">
              <ProductHuntBadge />
              {/* <a
                href="https://www.producthunt.com/products/inbox-zero-tabs"
                target="_blank"
                rel="noreferrer"
                className="mx-auto flex max-w-fit animate-fade-up items-center justify-center space-x-2 overflow-hidden rounded-full bg-green-50 px-7 py-2 transition-colors hover:bg-green-100"
              >
                <LayoutPanelTopIcon className="h-5 w-5 text-green-600" />
                <p className="text-sm font-semibold text-green-600">
                  Inbox Zero Tabs is live on Product Hunt!
                </p>
              </a> */}
            </div>
          )}

          <div className="mx-auto max-w-xl text-center">
            <HeroText>
              {props.title ||
                "Meet Your AI Email Assistant That Actually Works"}
            </HeroText>
            <HeroSubtitle>
              {props.subtitle ||
                "Cut your email time in half. Inbox Zero intelligently automates responses, organizes your inbox, and helps you reach inbox zero in record time."}
            </HeroSubtitle>
            <CTAComponent />
          </div>

          <LogoCloud />

          <div className="relative mt-16 flow-root sm:mt-24">
            {props.video || (
              <HeroVideoDialog
                className="block"
                animationStyle="top-in-bottom-out"
                videoSrc="https://www.youtube.com/embed/hfvKvTHBjG0?autoplay=1&rel=0"
                thumbnailSrc={
                  props.image || "/images/home/bulk-unsubscriber.png"
                }
                thumbnailAlt="Bulk Unsubscriber Screenshot"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductHuntBadge() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
      <Link
        // href="https://www.producthunt.com/posts/inbox-zero-2?utm_source=badge-top-post-badge&utm_medium=badge&utm_souce=badge-inbox&#0045;zero&#0045;2"
        href="https://www.producthunt.com/products/inbox-zero-tabs"
        target="_blank"
        rel="noreferrer"
      >
        <Image
          src="/images/home/product-hunt-badge.svg"
          alt="Inbox&#0032;Zero | Product Hunt"
          className="h-[54px] w-[250px]"
          width="250"
          height="54"
        />
      </Link>
    </div>
  );
}
