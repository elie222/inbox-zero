import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CaseStudyCard } from "./components/CaseStudyCard";
import { BlogLayout } from "@/components/layouts/BlogLayout";

export const metadata: Metadata = {
  title: "Customer Success Stories | Inbox Zero Case Studies",
  description:
    "Discover how businesses save hours weekly and transform their email management with Inbox Zero's AI automation. Real customer stories and results.",
  alternates: {
    canonical: "/case-studies",
  },
};

const caseStudies = [
  {
    slug: "clicks-talent-saves-60-hours-weekly",
    title: "How Clicks Talent Saves 60+ Hours Weekly with Inbox Zero",
    company: "Clicks Talent",
    industry: "Influencer Marketing",
    companySize: "50 employees",
    summary:
      "Influencer marketing agency transforms email management, handling 10,000+ daily emails while saving 60+ hours weekly through AI automation.",
    keyResults: [
      "60+ hours saved weekly",
      "10,000+ emails handled daily",
      "80% AI response accuracy",
      "Eliminated need for 24/7 staff monitoring",
    ],
  },
];

export default function CaseStudiesPage() {
  return (
    <BlogLayout>
      <div className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="mb-8 font-title text-3xl tracking-tight text-gray-900 sm:text-4xl">
              Customer Success Stories
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover how businesses across industries are transforming their
              email management and saving countless hours with Inbox Zero's AI
              automation.
            </p>
          </div>

          {/* Case Studies Grid */}
          <div className="grid grid-cols-1 gap-8 mb-16">
            {caseStudies.map((study) => (
              <CaseStudyCard key={study.slug} {...study} />
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center bg-blue-50 rounded-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to Transform Your Email Management?
            </h2>
            <p className="text-lg text-gray-600 mb-6 max-w-2xl mx-auto">
              Join thousands of businesses already saving hours weekly with
              Inbox Zero's AI-powered email automation.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/sign-up">
                <Button size="lg">Start Free Trial</Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" size="lg">
                  Schedule Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </BlogLayout>
  );
}
