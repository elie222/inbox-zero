"use client";

import { cx } from "class-variance-authority";
import Image from "next/image";

const brands = [
  {
    alt: "Diary of a CEO",
    src: "/images/new-landing/logos/doac.svg",
    width: 100,
    offset: "-translate-y-1",
  },
  {
    alt: "Netflix",
    src: "/images/new-landing/logos/netflix.svg",
    width: 130,
  },
  {
    alt: "Resend",
    src: "/images/new-landing/logos/resend.svg",
    width: 150,
  },
  {
    alt: "Zendesk",
    src: "/images/new-landing/logos/zendesk.svg",
    width: 140,
  },
  {
    alt: "Alta",
    src: "/images/new-landing/logos/alta.svg",
    width: 90,
    offset: "-translate-y-1.5",
  },
  {
    alt: "ByteDance",
    src: "/images/new-landing/logos/bytedance.svg",
    width: 200,
  },
  {
    alt: "Wix",
    src: "/images/new-landing/logos/wix.svg",
    width: 80,
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
          {brands.map(({ alt, src, width, offset }) => (
            <div className={cx("flex items-start", offset)} key={alt}>
              <Image src={src} alt={alt} width={width} height={0} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
