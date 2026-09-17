"use client";

import { Paragraph } from "@/components/new-landing/common/Typography";
import { type Brand, BRANDS_LIST } from "@/utils/brands";
import { userCount } from "@/utils/config";
import Image from "next/image";
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
  <div className={cn("mt-12", className)}>
    <Paragraph>Join {userCount} professionals, including people at:</Paragraph>
    <div className="group flex max-w-full flex-row overflow-x-hidden py-10 [gap:var(--gap))] [--gap:2rem] [mask-image:linear-gradient(to_right,_rgba(0,_0,_0,_0),rgba(0,_0,_0,_1)_10%,rgba(0,_0,_0,_1)_90%,rgba(0,_0,_0,_0))] md:[--gap:3rem]">
      {new Array(4).fill(0).map((_, i) => (
        <div
          className={cn(
            "flex shrink-0 flex-row justify-around opacity-90 [--duration:100s] [gap:var(--gap)] [margin-right:var(--gap)]",
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
);
