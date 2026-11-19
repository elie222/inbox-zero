"use client";

import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();

  return (
    <SettingCard
      title={t`Learned patterns`}
      description={t`View the patterns the assistant has learned from your email history.`}
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Trans>View</Trans>
            </Button>
          </DialogTrigger>
          {/* Scroll inside the content row (not DialogContent itself) so the close button stays visible */}
          <DialogContent className="max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                <Trans>Learned patterns</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>
                  When the AI processes your emails, it learns which senders or
                  email types consistently match the same rules. For example, it
                  might learn that emails from newsletter@example.com always
                  match your "Newsletter" rule. These learned patterns help the
                  AI make faster, more accurate decisions over time. You can
                  view, edit, or remove patterns that have been learned.
                </Trans>
              </DialogDescription>
            </DialogHeader>
            <div className="min-w-0 overflow-y-auto">
              <Content />
            </div>
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
            <TypographyP>
              <Trans>No learned patterns found yet.</Trans>
            </TypographyP>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data?.groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle>
                  {group.rule?.name || <Trans>No rule</Trans>}
                </CardTitle>
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
