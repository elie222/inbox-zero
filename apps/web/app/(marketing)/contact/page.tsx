import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { PageHeading, TypographyP } from "@/components/Typography";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { CardBasic } from "@/components/ui/card";
import { env } from "@/env";
import { MailIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact - Inbox Zero",
  description: "Get help and support for Inbox Zero",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <BasicLayout>
      <div className="pb-40 pt-60">
        <CardBasic className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <MailIcon className="h-8 w-8 text-blue-600" />
          </div>

          <PageHeading>Need Help?</PageHeading>

          <div className="mt-4 space-y-4">
            <TypographyP>
              We're here to help! If you have any questions, issues, or feedback
              about Inbox Zero, please don't hesitate to reach out to our
              support team.
            </TypographyP>

            <TypographyP>You can contact us directly via email:</TypographyP>

            <div className="mt-6">
              <Button
                size="xl"
                link={{
                  href: `mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}?subject=Inbox Zero Support Request`,
                }}
              >
                <MailIcon className="mr-2 h-5 w-5" />
                Email Support
              </Button>
            </div>
          </div>
        </CardBasic>
      </div>
    </BasicLayout>
  );
}
