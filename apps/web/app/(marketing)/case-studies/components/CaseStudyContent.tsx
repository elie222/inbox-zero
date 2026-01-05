"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Prose } from "@/app/(marketing)/blog/components/Prose";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface CaseStudyContentProps {
  title: string;
  company: string;
  industry: string;
  companySize: string;
  interviewee: string;
  role: string;
  content: ReactNode;
  companyUrl?: string;
  intervieweeAvatar?: string;
  companyScreenshot?: string;
}

export function CaseStudyContent({
  title,
  company,
  industry,
  companySize,
  interviewee,
  role,
  content,
  companyUrl,
  intervieweeAvatar,
  companyScreenshot,
}: CaseStudyContentProps) {
  return (
    <Card>
      <CardContent className="p-10">
        {/* Header */}
        <div className="mb-8 border-b border-gray-200 pb-8">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{title}</h1>

          {/* Company Info */}
          <div className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Company
                </h3>
                <p className="mt-1 text-lg font-medium text-gray-900">
                  {companyUrl ? (
                    <Link
                      href={companyUrl}
                      target="_blank"
                      className="text-blue-600 hover:underline"
                    >
                      {company}
                    </Link>
                  ) : (
                    company
                  )}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Industry
                </h3>
                <p className="mt-1 text-lg text-gray-900">{industry}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Company Size
                </h3>
                <p className="mt-1 text-lg text-gray-900">{companySize}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Interviewee
                </h3>
                <div className="mt-2 flex items-center space-x-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={intervieweeAvatar} alt={interviewee} />
                    <AvatarFallback>
                      {interviewee
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      {interviewee}
                    </p>
                    <p className="text-sm text-gray-600">{role}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {companyScreenshot && (
          <div className="mb-8">
            <div className="relative aspect-video overflow-hidden rounded-lg border border-gray-200">
              <Image
                src={companyScreenshot}
                alt={`${company} homepage screenshot`}
                fill
                className="object-cover"
              />
            </div>
          </div>
        )}

        <Prose className="prose-a:font-semibold prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline">
          {content}
        </Prose>
      </CardContent>
    </Card>
  );
}
