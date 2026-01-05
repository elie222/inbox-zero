import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { TryInboxZero } from "@/app/(marketing)/blog/components/TryInboxZero";
import { CaseStudyContent } from "./CaseStudyContent";

export interface CaseStudyProps {
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

export function CaseStudy({
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
}: CaseStudyProps) {
  return (
    <article className="mx-auto grid w-full max-w-screen-xl gap-5 px-0 pt-16 md:grid-cols-4 md:pt-24 lg:gap-4 lg:px-20">
      <main className="md:col-span-3">
        <CaseStudyContent
          title={title}
          company={company}
          industry={industry}
          companySize={companySize}
          interviewee={interviewee}
          role={role}
          companyUrl={companyUrl}
          intervieweeAvatar={intervieweeAvatar}
          companyScreenshot={companyScreenshot}
          content={content}
        />
      </main>

      <aside className="hidden md:block">
        <div className="sticky top-20">
          <div className="mb-4">
            <TryInboxZero />
          </div>

          <Card className="mb-4">
            <CardContent className="pt-6">
              <h3 className="mb-2 text-lg font-semibold">About {company}</h3>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Industry:</span> {industry}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Size:</span> {companySize}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-2 text-lg font-semibold">Interviewee</h3>
              <div className="flex items-center space-x-3">
                <Avatar className="h-12 w-12">
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
                  <p className="font-medium">{interviewee}</p>
                  <p className="text-sm text-gray-600">{role}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </aside>
    </article>
  );
}
