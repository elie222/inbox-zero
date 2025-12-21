export type Brand = {
  alt: string;
  src: string;
  height?: string;
};

const BRANDS = {
  doac: {
    alt: "Diary of a CEO",
    src: "/images/new-landing/logos/doac.svg",
    height: "h-7 sm:h-8 md:h-10 -translate-y-1",
  },
  netflix: {
    alt: "Netflix",
    src: "/images/new-landing/logos/netflix.svg",
  },
  resend: {
    alt: "Resend",
    src: "/images/new-landing/logos/resend.svg",
  },
  compass: {
    alt: "Compass",
    src: "/images/new-landing/logos/compass.svg",
  },
  alta: {
    alt: "Alta",
    src: "/images/new-landing/logos/alta.svg",
  },
  bytedance: {
    alt: "ByteDance",
    src: "/images/new-landing/logos/bytedance.svg",
  },
  wix: {
    alt: "Wix",
    src: "/images/new-landing/logos/wix.svg",
  },
  joco: {
    alt: "JOCO",
    src: "/images/new-landing/logos/joco.svg",
  },
  kw: {
    alt: "Keller Williams",
    src: "/images/new-landing/logos/kw.svg",
  },
} as const satisfies Record<string, Brand>;

export type BrandKey = keyof typeof BRANDS;

const BRANDS_LIST = {
  default: [
    BRANDS.doac,
    BRANDS.netflix,
    BRANDS.resend,
    BRANDS.compass,
    BRANDS.alta,
    BRANDS.bytedance,
    BRANDS.wix,
    BRANDS.joco,
    BRANDS.kw,
  ],
  realtor: [
    BRANDS.alta,
    BRANDS.netflix,
    BRANDS.wix,
    BRANDS.kw,
    BRANDS.compass,
    BRANDS.bytedance,
  ],
} satisfies Record<string, Brand[]>;

export type BrandListKey = keyof typeof BRANDS_LIST;

export { BRANDS_LIST };
