import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TryInboxZero } from "@/app/(marketing)/blog/components/TryInboxZero";
import { AlternativeComparisonContent } from "./AlternativeComparisonContent";
import { CheckCircle2, XCircle } from "lucide-react";

export interface AlternativeComparisonProps {
  title: string;
  alternativeName: string;
  alternativeDescription: string;
  alternativePricing: {
    starter: string;
    pro: string;
  };
  inboxZeroPricing: string;
  content: ReactNode;
  pros?: string[];
  cons?: string[];
}

export function AlternativeComparison({
  title,
  alternativeName,
  alternativeDescription,
  alternativePricing,
  inboxZeroPricing,
  content,
  pros,
  cons,
}: AlternativeComparisonProps) {
  return (
    <article className="mx-auto grid w-full max-w-screen-xl gap-5 px-0 pt-16 md:grid-cols-4 md:pt-7 lg:gap-4 lg:px-20">
      <main className="md:col-span-3">
        <AlternativeComparisonContent
          title={title}
          alternativeName={alternativeName}
          alternativeDescription={alternativeDescription}
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
              <h3 className="mb-4 text-lg font-semibold">Quick Comparison</h3>

              <div className="mb-4">
                <h4 className="mb-2 text-sm font-medium text-gray-600">
                  {alternativeName} Pricing
                </h4>
                <div className="space-y-1">
                  <p className="text-sm">
                    Starter: {alternativePricing.starter}
                  </p>
                  <p className="text-sm">Pro: {alternativePricing.pro}</p>
                </div>
              </div>

              <div className="mb-4 border-t pt-4">
                <h4 className="mb-2 text-sm font-medium text-gray-600">
                  Inbox Zero Pricing
                </h4>
                <p className="text-sm font-semibold text-green-600">
                  {inboxZeroPricing}
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600">
                  Save up to 50% with Inbox Zero
                </p>
              </div>
            </CardContent>
          </Card>

          {(pros?.length || cons?.length) && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4 text-lg font-semibold">
                  {alternativeName} Overview
                </h3>

                {pros && pros.length > 0 && (
                  <div className="mb-4">
                    <h4 className="mb-2 flex items-center text-sm font-medium text-green-600">
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Pros
                    </h4>
                    <ul className="space-y-1">
                      {pros.map((pro, index) => (
                        <li key={index} className="text-sm text-gray-600">
                          • {pro}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {cons && cons.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center text-sm font-medium text-red-600">
                      <XCircle className="mr-1 h-4 w-4" />
                      Cons
                    </h4>
                    <ul className="space-y-1">
                      {cons.map((con, index) => (
                        <li key={index} className="text-sm text-gray-600">
                          • {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </aside>
    </article>
  );
}
