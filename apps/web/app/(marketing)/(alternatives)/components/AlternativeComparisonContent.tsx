"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Prose } from "@/app/(marketing)/blog/components/Prose";

interface AlternativeComparisonContentProps {
  title: string;
  alternativeName: string;
  alternativeDescription: string;
  content: ReactNode;
}

export function AlternativeComparisonContent({
  title,
  alternativeName,
  alternativeDescription,
  content,
}: AlternativeComparisonContentProps) {
  return (
    <Card>
      <CardContent className="p-10">
        <div className="mb-8 border-b border-gray-200 pb-8">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{title}</h1>

          <div className="rounded-lg bg-blue-50 p-6">
            <h2 className="mb-2 text-lg font-semibold text-blue-900">
              Comparing {alternativeName} with Inbox Zero
            </h2>
            <p className="text-gray-700">{alternativeDescription}</p>
          </div>
        </div>

        <Prose className="prose-a:font-semibold prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline prose-table:w-full prose-th:text-left prose-th:border prose-th:p-4 prose-td:border prose-td:p-4 prose-td:first:pl-4 prose-th:first:pl-4">
          {content}
        </Prose>
      </CardContent>
    </Card>
  );
}
