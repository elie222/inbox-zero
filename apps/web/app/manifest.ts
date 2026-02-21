import type { MetadataRoute } from "next";
import { BRAND_ICON_URL, BRAND_NAME } from "@/utils/branding";

type ManifestIcon = NonNullable<MetadataRoute.Manifest["icons"]>[number];

const defaultIcons: ManifestIcon[] = [
  {
    src: "/icons/icon-192x192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: "/icons/icon-512x512.png",
    sizes: "512x512",
    type: "image/png",
  },
];

export default function manifest(): MetadataRoute.Manifest {
  const customIcon: ManifestIcon[] =
    BRAND_ICON_URL === "/icon.png"
      ? []
      : [{ src: BRAND_ICON_URL, sizes: "any" as const }];

  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    icons: [...customIcon, ...defaultIcons],
    theme_color: "#FFFFFF",
    background_color: "#FFFFFF",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
  };
}
