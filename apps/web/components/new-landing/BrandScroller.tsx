"use client";

import { cx } from "class-variance-authority";
import Image from "next/image";

const brands = [
  {
    alt: "Diary of a CEO",
    src: "/images/new-landing/logos/doac.svg",
    height: "h-7 sm:h-8 md:h-10 -translate-y-1",
  },
  {
    alt: "Netflix",
    src: "/images/new-landing/logos/netflix.svg",
  },
  {
    alt: "Resend",
    src: "/images/new-landing/logos/resend.svg",
  },
  {
    alt: "Zendesk",
    src: "/images/new-landing/logos/zendesk.svg",
  },
  {
    alt: "Alta",
    src: "/images/new-landing/logos/alta.svg",
    height: "h-6 sm:h-7 md:h-9 -translate-y-1",
  },
  {
    alt: "ByteDance",
    src: "/images/new-landing/logos/bytedance.svg",
  },
  {
    alt: "Wix",
    src: "/images/new-landing/logos/wix.svg",
  },
];

export const BrandScroller = () => {
  return (
    <div className="group flex overflow-x-hidden py-10 [--gap:2rem] md:[--gap:3rem] [gap:var(--gap))] flex-row max-w-full [mask-image:linear-gradient(to_right,_rgba(0,_0,_0,_0),rgba(0,_0,_0,_1)_10%,rgba(0,_0,_0,_1)_90%,rgba(0,_0,_0,_0))]">
      {new Array(4).fill(0).map((_, i) => (
        <div
          className="flex shrink-0 justify-around [margin-right:var(--gap)] [gap:var(--gap)] flex-row animate-marquee [--duration:100s] opacity-90"
          key={i}
        >
          {brands.map(({ alt, src, height }) => (
            <div className="flex items-start" key={alt}>
              <Image
                src={src}
                alt={alt}
                width={100}
                height={100}
                className={cx("w-auto", height || "h-5 sm:h-6 md:h-8")}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
