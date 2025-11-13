import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: [
      "https://www.getinboxzero.com/sitemap.xml",
      "https://docs.getinboxzero.com/sitemap.xml",
    ],
  };
}
