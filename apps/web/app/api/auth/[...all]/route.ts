import { betterAuthConfig } from "@/utils/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

export const { POST, GET } = toNextJsHandler(betterAuthConfig);

export const OPTIONS = async () => {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin":
        process.env.NODE_ENV === "production"
          ? process.env.NEXT_PUBLIC_BASE_URL || "https://getinboxzero.com"
          : "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400", // 24 hours
    },
  });
};
