import type { Metadata } from "next";
import Link from "next/link";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import {
  PageHeading,
  Paragraph,
  Subheading,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME, getBrandTitle, SUPPORT_EMAIL } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("About"),
  description: `About ${BRAND_NAME}: the open-source AI email assistant for labels, drafts, unsubscribe, cold email blocking, and analytics.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <BasicLayout>
      <div className="mx-auto max-w-3xl py-16 md:py-24">
        <PageHeading>About {BRAND_NAME}</PageHeading>
        <Paragraph size="lg" className="mt-6" color="dark">
          {BRAND_NAME} is an AI email assistant that helps you reach inbox zero
          faster. It organizes your inbox with smart labels, drafts replies in
          your voice, unsubscribes from unwanted mail in bulk, blocks cold
          emails, and shows analytics so you can see where your time goes.
        </Paragraph>

        <section className="mt-12 space-y-4">
          <Subheading>What {BRAND_NAME} does</Subheading>
          <Paragraph color="dark">
            Connect Gmail, Google Workspace, or Microsoft Outlook and let the
            assistant handle routine email work. Use plain-English rules to
            automate labels and actions, review pre-written drafts before you
            send, clean newsletters with bulk unsubscribe, and keep spammy cold
            outreach out of your way. Analytics highlight volume and trends so
            you can stay on top of your inbox without living in it.
          </Paragraph>
        </section>

        <section className="mt-12 space-y-4">
          <Subheading>Open source and secure</Subheading>
          <Paragraph color="dark">
            {BRAND_NAME} is open source. The code is public on{" "}
            <Link
              href="https://github.com/elie222/inbox-zero"
              className="underline underline-offset-2 hover:text-gray-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
            , so you can inspect how it works, self-host, or contribute. The
            hosted product is SOC 2 compliant. Learn more about our security
            posture at{" "}
            <Link
              href="https://security.getinboxzero.com"
              className="underline underline-offset-2 hover:text-gray-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              security.getinboxzero.com
            </Link>
            .
          </Paragraph>
        </section>

        <section className="mt-12 space-y-4">
          <Subheading>Who it is for</Subheading>
          <Paragraph color="dark">
            {BRAND_NAME} is built for founders, operators, and professionals who
            get more email than they can reasonably handle by hand. If you want
            an AI assistant that labels, drafts, unsubscribes, and blocks cold
            email—without locking you into a closed inbox replacement—
            {BRAND_NAME} is designed for that workflow.
          </Paragraph>
        </section>

        <section className="mt-12 space-y-4">
          <Subheading>Contact</Subheading>
          <Paragraph color="dark">
            Questions, feedback, or support requests: email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline underline-offset-2 hover:text-gray-900"
            >
              {SUPPORT_EMAIL}
            </a>
            . You can also visit our{" "}
            <Link
              href="/support"
              className="underline underline-offset-2 hover:text-gray-900"
            >
              support
            </Link>
            ,{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-gray-900"
            >
              privacy
            </Link>
            , and{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 hover:text-gray-900"
            >
              terms
            </Link>{" "}
            pages.
          </Paragraph>
        </section>
      </div>
    </BasicLayout>
  );
}
