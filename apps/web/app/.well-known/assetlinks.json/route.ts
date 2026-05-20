import { NextResponse } from "next/server";
import { env } from "@/env";

const ANDROID_PACKAGE_NAME = "com.getinboxzero.app";

export function GET() {
  const fingerprints = getAndroidCertificateFingerprints();

  return NextResponse.json(
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
      : [],
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/json",
      },
    },
  );
}

function getAndroidCertificateFingerprints(): string[] {
  return (env.ANDROID_APP_CERT_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((fingerprint) => fingerprint.trim())
    .filter(Boolean);
}
