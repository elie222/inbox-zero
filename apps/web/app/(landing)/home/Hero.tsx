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
}) {
  return (
    <div className="relative pt-14">
      <SquaresPattern />
      <div className="pt-24 sm:pb-12 sm:pt-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* <HeroTag /> */}
          <div className="mb-10">
            <ProductHuntBadge />
          </div>

          <div className="mx-auto max-w-xl text-center">
            <HeroText>
              {props.title || "Stop wasting half your day in Gmail"}
            </HeroText>
            <HeroSubtitle>
              {props.subtitle ||
                "Automate your email with AI, bulk unsubscribe from newsletters, and block cold emails. Open-source."}
            </HeroSubtitle>
            <CTAButtons />
          </div>

          <LogoCloud />

          <div className="relative mt-16 flow-root sm:mt-24">
            <HeroVideoDialog
              className="block"
              animationStyle="top-in-bottom-out"
              videoSrc="https://www.youtube.com/embed/hfvKvTHBjG0?autoplay=1&rel=0"
              thumbnailSrc={props.image || "/images/home/bulk-unsubscriber.png"}
              thumbnailAlt="Bulk Unsubscriber Screenshot"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// function HeroTag() {
//   return (
//     <div className="mb-8 flex justify-center bg-white">
//       <div className="relative flex items-center gap-x-4 rounded-full px-4 py-1 text-sm leading-6 text-gray-600 ring-1 ring-gray-900/10 hover:ring-gray-900/20">
//         <a
//           href="/product-hunt"
//           className="flex items-center gap-x-1 font-semibold text-blue-600"
//         >
//           <span className="absolute inset-0" aria-hidden="true" />
//           We are live on Product Hunt!
//           <ChevronRightIcon
//             className="-mr-2 h-5 w-5 text-gray-400"
//             aria-hidden="true"
//           />
//         </a>
//       </div>
//     </div>
//   );
// }

function ProductHuntBadge() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
      <a
        href="https://www.producthunt.com/posts/inbox-zero-2?utm_source=badge-top-post-badge&utm_medium=badge&utm_souce=badge-inbox&#0045;zero&#0045;2"
        target="_blank"
        rel="noreferrer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=431438&theme=neutral&period=daily"
          alt="Inbox&#0032;Zero - Clean&#0032;up&#0032;your&#0032;inbox&#0032;in&#0032;minutes&#0044;&#0032;open&#0032;source | Product Hunt"
          className="h-[54px] w-[250px]"
          width="250"
          height="54"
        />
      </a>

      {/* <a
        href="https://www.producthunt.com/posts/inbox-zero-5?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-inbox&#0045;zero&#0045;2"
        target="_blank"
      >
        <img
          src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=431438&theme=light"
          alt="Inbox&#0032;Zero - Clean&#0032;up&#0032;your&#0032;inbox&#0032;in&#0032;minutes&#0044;&#0032;open&#0032;source | Product Hunt"
          className="h-[54px] w-[250px]"
          width="250"
          height="54"
        />
      </a> */}
    </div>
  );
}
