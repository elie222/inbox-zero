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
    theme_color: "#0A0E17",
    background_color: "#0A0E17",
    // A stable id keeps an already-installed app updating in place even if
    // start_url changes later
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
  };
}
