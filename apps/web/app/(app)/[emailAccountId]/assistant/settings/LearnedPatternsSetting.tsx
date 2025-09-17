"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/Typography";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { LoadingContent } from "@/components/LoadingContent";

export function LearnedPatternsSetting() {
  return (
    <SettingCard
      title="Learned Patterns"
      description="View the patterns the assistant has learned from your email history."
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Learned Patterns</DialogTitle>
              <DialogDescription>
                When the AI processes your emails, it learns which senders or
                email types consistently match the same rules. For example, it
                might learn that emails from newsletter@example.com always match
                your "Newsletter" rule. These learned patterns help the AI make
                faster, more accurate decisions over time. You can view, edit,
                or remove patterns that have been learned.
              </DialogDescription>
            </DialogHeader>
            <Content />
          </DialogContent>
        </Dialog>
      }
    />
  );
}

function Content() {
  const { data, isLoading, error } = useSWR<GroupsResponse>("/api/user/group");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.groups.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-6">
            <TypographyP>No learned patterns found yet.</TypographyP>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data?.groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle>{group.rule?.name || "No rule"}</CardTitle>
              </CardHeader>
              <CardContent>
                <ViewLearnedPatterns groupId={group.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </LoadingContent>
  );
}
