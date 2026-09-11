import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2Icon } from "lucide-react";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { getEnabledLoginProviders } from "@/utils/oauth/login-providers";
import { BRAND_NAME, SUPPORT_EMAIL, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Microsoft admin consent"),
  description: `Approve ${BRAND_NAME} for your Microsoft 365 organization.`,
  alternates: { canonical: "/login/microsoft-admin-consent" },
};

export default async function MicrosoftAdminConsentPage(props: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const searchParams = await props.searchParams;
  const hasMicrosoftLogin = getEnabledLoginProviders().has("microsoft");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-14 px-6 py-12 md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] md:items-center lg:px-8">
        <section className="max-w-xl">
          <Logo className="mb-12 h-auto w-56 text-primary" />
          <h1 className="font-title text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            Approve {BRAND_NAME} for your organization
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Grant tenant-wide Microsoft admin consent so users in your
            organization can connect their own Outlook mailboxes without each
            approval being blocked by IT.
          </p>

          <AdminConsentStatus
            status={searchParams?.status}
            error={searchParams?.error}
          />

          <div className="mt-12 space-y-6">
            {hasMicrosoftLogin ? (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full py-6"
              >
                <a
                  href="/api/outlook/admin-consent"
                  className="flex items-center justify-center"
                >
                  <Image
                    src="/images/microsoft.svg"
                    alt="Microsoft"
                    width={24}
                    height={24}
                    unoptimized
                  />
                  <span className="ml-3">
                    Grant Admin Consent with Microsoft
                  </span>
                </a>
              </Button>
            ) : (
              <AlertBasic
                variant="destructive"
                title="Microsoft login is not configured"
                description={`Set up Microsoft OAuth before granting admin consent. Contact ${SUPPORT_EMAIL} if you need help.`}
              />
            )}

            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-foreground hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </div>
        </section>

        <section className="space-y-8">
          {ADMIN_CONSENT_POINTS.map((point) => (
            <div key={point.title} className="flex gap-4">
              <CheckCircle2Icon className="mt-1 size-7 shrink-0 text-green-500" />
              <div>
                <h2 className="text-base font-semibold uppercase tracking-normal text-foreground">
                  {point.title}
                </h2>
                <p className="mt-1 text-base leading-7 text-muted-foreground">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

const ADMIN_CONSENT_POINTS = [
  {
    title: "Microsoft 365 integration",
    description: "Works with your existing Microsoft Entra organization.",
  },
  {
    title: "Tenant-wide approval",
    description: "Approves the Microsoft permissions once for eligible users.",
  },
  {
    title: "User-level connection",
    description: "Each user still signs in and connects their own mailbox.",
  },
  {
    title: "Admin control",
    description: "Manage access later from Microsoft Entra Enterprise Apps.",
  },
] as const;

function AdminConsentStatus({
  status,
  error,
}: {
  status?: string;
  error?: string;
}) {
  if (status === "success") {
    return (
      <AlertBasic
        className="mt-8"
        variant="success"
        title="Admin consent granted"
        description="Users in your organization can now sign in with Microsoft and connect their own Outlook mailbox."
      />
    );
  }

  if (!error) return null;

  return (
    <AlertBasic
      className="mt-8"
      variant="destructive"
      title="Admin consent was not completed"
      description="Try again with a Microsoft 365 admin account that is allowed to grant tenant-wide consent."
    />
  );
}
