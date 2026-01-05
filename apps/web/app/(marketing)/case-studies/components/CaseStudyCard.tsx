import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface CaseStudyCardProps {
  slug: string;
  title: string;
  company: string;
  industry: string;
  companySize: string;
  summary: string;
  keyResults: string[];
}

export function CaseStudyCard({
  slug,
  title,
  company,
  industry,
  companySize,
  summary,
  keyResults,
}: CaseStudyCardProps) {
  return (
    <Card className="overflow-hidden transition-transform duration-300 hover:scale-105">
      <CardContent className="p-8">
        {/* Company Info */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="font-medium">{company}</span>
              <Badge variant="secondary">{industry}</Badge>
              <span>{companySize}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <p className="text-gray-700 mb-6 text-lg leading-relaxed">{summary}</p>

        {/* Key Results */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Key Results
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {keyResults.map((result, index) => (
              <div
                key={index}
                className="flex items-center text-sm text-gray-700"
              >
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 flex-shrink-0" />
                {result}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-between">
          <Link href={`/case-studies/study/${slug}`}>
            <Button>Read Full Case Study</Button>
          </Link>
          <span className="text-sm text-gray-500">5 min read</span>
        </div>
      </CardContent>
    </Card>
  );
}
