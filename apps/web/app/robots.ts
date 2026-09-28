import type { MetadataRoute } from "next";
import { env } from "@/env";
import { buildRobotsPolicy } from "@/utils/indexing";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy({
    vercelEnv: process.env.VERCEL_ENV,
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    disableIndexing: env.NEXT_PUBLIC_DISABLE_INDEXING,
  });
}
