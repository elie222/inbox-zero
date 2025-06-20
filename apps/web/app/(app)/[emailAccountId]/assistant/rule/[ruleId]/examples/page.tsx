"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import groupBy from "lodash/groupBy";
import { TopSection } from "@/components/TopSection";
import { Button } from "@/components/ui/button";
import { ExampleList } from "@/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/examples/example-list";
import type { ExamplesResponse } from "@/app/api/user/rules/[id]/example/route";
import { LoadingContent } from "@/components/LoadingContent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export default function RuleExamplesPage(props: {
  params: Promise<{ ruleId: string }>;
}) {
  const params = use(props.params);
  const { data, isLoading, error } = useSWR<ExamplesResponse>(
    `/api/user/rules/${params.ruleId}/example`,
  );
  const { emailAccountId } = useAccount();
  const threads = groupBy(data, (m) => m.threadId);
  const groupedBySenders = groupBy(threads, (t) => t[0]?.headers.from);

  const hasExamples = Object.keys(groupedBySenders).length > 0;

  return (
    <div>
      <TopSection
        title="Your rule has been created!"
        descriptionComponent={
          <>
            {hasExamples ? (
              <p>
                Here are some examples of previous emails that match this rule.
              </p>
            ) : (
              <p>
                We did not find any examples to show you that match this rule.
              </p>
            )}
            <Button className="mt-4" asChild>
              <Link
                href={prefixPath(
                  emailAccountId,
                  `/automation?tab=rule&ruleId=${params.ruleId}`,
                )}
              >
                View Rule
              </Link>
            </Button>
          </>
        }
      />
      <LoadingContent loading={!data && isLoading} error={error}>
        <ExampleList groupedBySenders={groupedBySenders} />
      </LoadingContent>
    </div>
  );
}
