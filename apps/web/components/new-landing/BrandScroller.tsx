"use client";

import { Paragraph } from "@/components/new-landing/common/Typography";
import { type Brand, BRANDS_LIST } from "@/utils/brands";
import { userCount } from "@/utils/config";
import Image from "next/image";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { cn } from "@/utils";

interface BrandScrollerProps {
  brandList?: Brand[];
  animate?: boolean;
}

export const BrandScroller = ({
  brandList = BRANDS_LIST.default,
  animate = true,
}: BrandScrollerProps) => {
  return (
    <BlurFade duration={0.4} delay={0.125 * 10}>
      <div className="mt-12">
        <Paragraph>Join {userCount} users saving hours daily</Paragraph>
        <div className="group flex overflow-x-hidden py-10 [--gap:2rem] md:[--gap:3rem] [gap:var(--gap))] flex-row max-w-full [mask-image:linear-gradient(to_right,_rgba(0,_0,_0,_0),rgba(0,_0,_0,_1)_10%,rgba(0,_0,_0,_1)_90%,rgba(0,_0,_0,_0))]">
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
    </BlurFade>
  );
};
