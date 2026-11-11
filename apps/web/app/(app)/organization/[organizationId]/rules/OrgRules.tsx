"use client";

import {
  MoreHorizontalIcon,
  PenIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Loading } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TypographyH3, MutedText } from "@/components/Typography";
import { AccessDenied } from "@/components/AccessDenied";
import { toastError, toastSuccess } from "@/components/Toast";
import { useDialogState } from "@/hooks/useDialogState";
import { useOrganizationRules } from "@/hooks/useOrganizationRules";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";
import {
  deleteOrganizationRuleAction,
  setOrganizationRuleEnabledAction,
} from "@/utils/actions/organization-rule";
import { ACTION_TYPE_LABELS } from "@/utils/action-display";
import type { OrganizationRulesResponse } from "@/app/api/organizations/[organizationId]/rules/route";
import { OrgRuleDialog } from "./OrgRuleDialog";

type OrgRule = OrganizationRulesResponse["rules"][number];

export function OrgRules({ organizationId }: { organizationId: string }) {
  const { t } = useLingui();
  const { data: membership, isLoading: membershipLoading } =
    useOrganizationMembership();
  const isAdmin = hasOrganizationAdminRole(membership?.role ?? "");

  const { data, isLoading, error, mutate } =
    useOrganizationRules(organizationId);

  const ruleDialog = useDialogState<{ rule?: OrgRule }>();

  if (membershipLoading) {
    return <Loading />;
  }

  if (!isAdmin) {
    return (
      <AccessDenied
        message={t`You don't have permission to manage organization rules. Only administrators can access this page.`}
      />
    );
  }

  const memberCount = data?.memberCount ?? 0;

  const onToggleEnabled = async (rule: OrgRule, enabled: boolean) => {
    mutate(
      data
        ? {
            ...data,
            rules: data.rules.map((r) =>
              r.id === rule.id ? { ...r, enabled } : r,
            ),
          }
        : data,
      { revalidate: false },
    );
    try {
      const result = await setOrganizationRuleEnabledAction({
        organizationId,
        organizationRuleId: rule.id,
        enabled,
      });
      if (result?.serverError) {
        const serverError = result.serverError;
        toastError({
          description: enabled
            ? t`There was an error enabling the rule. ${serverError}`
            : t`There was an error disabling the rule. ${serverError}`,
        });
      }
    } finally {
      mutate();
    }
  };

  const onDelete = async (rule: OrgRule) => {
    const ruleName = rule.name;
    const confirmed = confirm(
      t`Delete "${ruleName}"? This removes the rule for all organization members.`,
    );
    if (!confirmed) return;

    const result = await deleteOrganizationRuleAction({
      organizationId,
      organizationRuleId: rule.id,
    });
    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }
    toastSuccess({ description: t`Rule deleted` });
    mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <TypographyH3>
            <Trans>Organization rules</Trans>
          </TypographyH3>
          <MutedText className="mt-1">
            <Trans>
              Rules you create here are applied to every member of your
              organization.
            </Trans>
          </MutedText>
        </div>
        <Button size="sm" onClick={() => ruleDialog.onOpen({})}>
          <PlusIcon className="mr-2 size-4" />
          <Trans>New rule</Trans>
        </Button>
      </div>

      <Card>
        <LoadingContent loading={isLoading} error={error}>
          {data?.rules.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    <Trans>Enabled</Trans>
                  </TableHead>
                  <TableHead>
                    <Trans>Name</Trans>
                  </TableHead>
                  <TableHead>
                    <Trans>Actions</Trans>
                  </TableHead>
                  <TableHead>
                    <Trans>Enabled for</Trans>
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Switch
                        size="sm"
                        checked={rule.enabled}
                        onCheckedChange={(enabled) =>
                          onToggleEnabled(rule, enabled)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.actions.map((action) => (
                          <Badge
                            key={action.id}
                            variant="secondary"
                            className="text-xs"
                          >
                            {ACTION_TYPE_LABELS[action.type]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      <Plural
                        value={memberCount}
                        one={`${rule._count.memberRules} / # member`}
                        other={`${rule._count.memberRules} / # members`}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-haspopup="true"
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontalIcon className="size-4" />
                            <span className="sr-only">
                              <Trans>Toggle menu</Trans>
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => ruleDialog.onOpen({ rule })}
                          >
                            <PenIcon className="mr-2 size-4" />
                            <Trans>Edit</Trans>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onDelete(rule)}>
                            <Trash2Icon className="mr-2 size-4" />
                            <Trans>Delete</Trans>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyDescription>
                <Trans>No organization rules yet.</Trans>
              </EmptyDescription>
              <Button size="sm" onClick={() => ruleDialog.onOpen({})}>
                <PlusIcon className="mr-2 size-4" />
                <Trans>Create your first rule</Trans>
              </Button>
            </Empty>
          )}
        </LoadingContent>
      </Card>

      <OrgRuleDialog
        organizationId={organizationId}
        rule={ruleDialog.data?.rule}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
      />
    </div>
  );
}
