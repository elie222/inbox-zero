"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading, TypographyP } from "@/components/Typography";
import { ViewGroup } from "@/app/(app)/[emailAccountId]/assistant/group/ViewGroup";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { LoadingContent } from "@/components/LoadingContent";

export default function DebugLearnedPage() {
  const { data, isLoading, error } = useSWR<GroupsResponse>("/api/user/group");

  return (
    <div className="container mx-auto py-6">
      <PageHeading className="mb-6">Learned Patterns</PageHeading>

      <LoadingContent loading={isLoading} error={error}>
        {data?.groups.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center p-6">
              <TypographyP>No learned patterns found yet.</TypographyP>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {data?.groups.map((group) => (
              <Card key={group.id}>
                <CardHeader>
                  <CardTitle>{group.rule?.name || "No rule"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ViewGroup groupId={group.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
