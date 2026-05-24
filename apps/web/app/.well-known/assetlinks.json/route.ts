import { NextResponse } from "next/server";
import { env } from "@/env";

const ANDROID_PACKAGE_NAME = "com.getinboxzero.app";

export function GET() {
  const fingerprints = env.ANDROID_APP_CERT_SHA256_FINGERPRINTS ?? [];
  const body =
    fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: ANDROID_PACKAGE_NAME,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}
