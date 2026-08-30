"use client";

import { Paragraph } from "@/components/new-landing/common/Typography";
import { type Brand, BRANDS_LIST } from "@/utils/brands";
import { userCount } from "@/utils/config";
import Image from "next/image";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { cn } from "@/utils";

interface BrandScrollerProps {
  animate?: boolean;
  brandList?: Brand[];
  className?: string;
}

export const BrandScroller = ({
  brandList = BRANDS_LIST.default,
  animate = true,
  className,
}: BrandScrollerProps) => (
  <BlurFade duration={0.4} delay={0.125 * 10}>
    <div className={cn("mt-12", className)}>
      <Paragraph>
        Join {userCount} professionals, including people at:
      </Paragraph>
      <div className="relative overflow-hidden">
        {/* Left fade */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 md:w-24 bg-gradient-to-r from-white to-transparent" />
        {/* Right fade */}
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 md:w-24 bg-gradient-to-l from-white to-transparent" />
        <div className="group flex overflow-x-hidden py-10 [--gap:2rem] md:[--gap:3rem] [gap:var(--gap))] flex-row max-w-full">
          {new Array(4).fill(0).map((_, i) => (
            <div
              className={cn(
                "flex shrink-0 justify-around [margin-right:var(--gap)] [gap:var(--gap)] flex-row [--duration:100s] opacity-90",
                animate ? "animate-marquee" : "",
              )}
              key={i}
            >
              {brandList.map(({ alt, src, height }) => (
                <div className="flex items-start" key={alt}>
                  <Image
                    src={src}
                    alt={alt}
                    width={100}
                    height={100}
                    className={cn("w-auto", height || "h-5 sm:h-6 md:h-8")}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  </BlurFade>
);
