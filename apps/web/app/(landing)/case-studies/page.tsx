import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Button } from "@/components/new-landing/common/Button";
import {
  Heading,
  Paragraph,
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Case Studies"),
  description: `See how teams use ${BRAND_NAME} to save time, organize their inboxes, and automate email workflows.`,
  alternates: { canonical: "/case-studies" },
};

export default function CaseStudiesPage() {
  return (
    <BasicLayout>
      <section className="py-12 text-center md:py-20">
        <Heading className="mx-auto max-w-[780px]">
          Real teams reaching inbox zero faster
        </Heading>
        <Paragraph className="mx-auto mt-4 max-w-[650px]" size="lg">
          Learn how busy teams use {BRAND_NAME} to reduce manual email work,
          respond faster, and keep important conversations moving.
        </Paragraph>
      </section>

      <section className="pb-16 md:pb-24">
        <article className="overflow-hidden rounded-[20px] border border-[#E7E7E780] bg-white text-left shadow-[0px_3px_12.9px_0px_#97979714]">
          <div className="grid gap-0 md:grid-cols-[1fr_360px]">
            <div className="flex flex-col justify-between p-6 md:p-8">
              <div>
                <div className="flex items-center gap-3">
                  <Image
                    src="/images/case-studies/clicks-talent/company.png"
                    alt="Clicks Talent"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-lg object-contain"
                  />
                  <div>
                    <Paragraph color="gray-900" className="font-medium">
                      Clicks Talent
                    </Paragraph>
                    <Paragraph size="sm">Creator marketing agency</Paragraph>
                  </div>
                </div>

                <h2 className="mt-8 max-w-[680px] font-title text-2xl leading-tight text-[#242424] md:text-4xl">
                  Saving 60+ hours a week while scaling the team
                </h2>
                <Paragraph className="mt-4 max-w-[640px]" size="lg">
                  Clicks Talent uses {BRAND_NAME} to keep fast-moving client and
                  creator conversations organized without adding manual inbox
                  work.
                </Paragraph>
              </div>

              <div className="mt-8 grid gap-4 text-center sm:grid-cols-3">
                <Metric label="Hours saved weekly" value="60+" />
                <Metric label="Team growth" value="20 to 50" />
                <Metric label="Inbox coverage" value="Always on" />
              </div>
            </div>

            <div className="bg-[#F7F8FA] p-6 md:p-8">
              <div className="flex h-full flex-col justify-between">
                <blockquote className="text-lg font-medium leading-7 text-gray-900">
                  "We save 60+ hours weekly and let us grow from 20 to 50
                  employees. It's like having an assistant that never sleeps."
                </blockquote>
                <div className="mt-8 flex items-center gap-4">
                  <Image
                    src="/images/case-studies/clicks-talent/ab-lieberman.png"
                    alt='Abraham "AB" Lieberman'
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <div>
                    <Paragraph color="gray-900" className="font-medium">
                      Abraham "AB" Lieberman
                    </Paragraph>
                    <Paragraph size="sm">Founder and CEO</Paragraph>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="pb-16 text-center md:pb-24">
        <SectionHeading>More customer stories are coming soon</SectionHeading>
        <SectionSubtitle>
          Teams are using {BRAND_NAME} across executive inboxes, agencies,
          operations, and support workflows.
        </SectionSubtitle>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>
    </BasicLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-title text-2xl leading-none text-[#242424]">{value}</p>
      <Paragraph className="mt-2" size="sm">
        {label}
      </Paragraph>
    </div>
  );
}
