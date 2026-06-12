"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  MoreHorizontalIcon,
  PenIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toastSuccess, toastError } from "@/components/Toast";
import { TypographyH3 } from "@/components/Typography";
import { TruncatedTooltipText } from "@/components/TruncatedTooltipText";
import { conditionsToString } from "@/utils/condition";
import {
  getActionDisplay,
  getActionIcon,
  getVisibleActions,
} from "@/utils/action-display";
import { useOrganizationRules } from "@/hooks/useOrganizationRules";
import { useOrganizationTeams } from "@/hooks/useOrganizationTeams";
import { useDialogState } from "@/hooks/useDialogState";
import {
  createOrganizationTeamAction,
  deleteOrganizationRuleAction,
  deleteOrganizationTeamAction,
  toggleOrganizationRuleAction,
} from "@/utils/actions/organization-rule";
import { OrganizationRuleDialog } from "./OrganizationRuleDialog";
import type { OrganizationRulesResponse } from "@/app/api/organizations/[organizationId]/rules/route";

type OrganizationRuleItem = OrganizationRulesResponse["rules"][number];

export function OrganizationRules({
  organizationId,
}: {
  organizationId: string;
}) {
  const { data, isLoading, error, mutate } =
    useOrganizationRules(organizationId);
  const {
    data: teamsData,
    isLoading: teamsLoading,
    error: teamsError,
    mutate: mutateTeams,
  } = useOrganizationTeams(organizationId);

  const ruleDialog = useDialogState<{ rule?: OrganizationRuleItem }>();

  const rules = data?.rules ?? [];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex justify-between items-center">
          <div>
            <TypographyH3>Rules ({rules.length})</TypographyH3>
            <p className="text-sm text-muted-foreground mt-1">
              Rules applied automatically to every member they target. Members
              can't change them.
            </p>
          </div>
          <Button size="sm" onClick={() => ruleDialog.onOpen({})}>
            <PlusIcon className="mr-2 hidden size-4 md:block" />
            Add Rule
          </Button>
        </div>

        <Card className="mt-4">
          <LoadingContent loading={isLoading} error={error}>
            {rules.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Enabled</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Conditions
                    </TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead className="w-16">Accounts</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <OrganizationRuleRow
                      key={rule.id}
                      rule={rule}
                      onEdit={() => ruleDialog.onOpen({ rule })}
                      mutate={mutate}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <CardHeader>
                <CardDescription className="flex flex-col items-center gap-4 py-16">
                  No organization rules yet. Add one to apply it to every
                  member's inbox.
                </CardDescription>
              </CardHeader>
            )}
          </LoadingContent>
        </Card>
      </div>

      <div>
        <TypographyH3>Teams</TypographyH3>
        <p className="text-sm text-muted-foreground mt-1">
          Group members by role, like Engineering or Marketing, then target
          rules at specific teams. Assign members to a team from the Members
          tab.
        </p>
        <div className="mt-4">
          <LoadingContent loading={teamsLoading} error={teamsError}>
            <Teams
              organizationId={organizationId}
              teams={teamsData?.teams ?? []}
              mutate={mutateTeams}
            />
          </LoadingContent>
        </div>
      </div>

      {ruleDialog.isOpen && (
        <OrganizationRuleDialog
          organizationId={organizationId}
          rule={ruleDialog.data?.rule}
          teams={teamsData?.teams ?? []}
          onClose={ruleDialog.onClose}
          onSuccess={() => {
            mutate();
            ruleDialog.onClose();
          }}
        />
      )}
    </div>
  );
}

function OrganizationRuleRow({
  rule,
  onEdit,
  mutate,
}: {
  rule: OrganizationRuleItem;
  onEdit: () => void;
  mutate: () => void;
}) {
  return (
    <TableRow className={!rule.enabled ? "bg-muted opacity-60" : ""}>
      <TableCell className="text-center">
        <Switch
          size="sm"
          checked={rule.enabled}
          onCheckedChange={async (enabled) => {
            const result = await toggleOrganizationRuleAction({
              id: rule.id,
              enabled,
            });
            if (result?.serverError) {
              toastError({
                description: `There was an error ${
                  enabled ? "enabling" : "disabling"
                } the rule. ${result.serverError}`,
              });
            }
            mutate();
          }}
        />
      </TableCell>
      <TableCell className="font-medium">{rule.name}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <TruncatedTooltipText
          text={conditionsToString(rule)}
          maxLength={50}
          className="max-w-xs"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1 flex-wrap">
          {getVisibleActions(rule.actions).map((action) => {
            const Icon = getActionIcon(action.type);
            return (
              <Badge key={action.id} variant="secondary" className="w-fit">
                <Icon className="size-3 mr-1.5 hidden sm:block" />
                {getActionDisplay(action, "google", [])}
              </Badge>
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        {rule.teams.length ? (
          <div className="flex gap-1 flex-wrap">
            {rule.teams.map((team) => (
              <Badge key={team.id} variant="outline">
                {team.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">All members</span>
        )}
      </TableCell>
      <TableCell className="text-center">{rule._count.managedRules}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-haspopup="true" size="icon" variant="ghost">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <PenIcon className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const yes = confirm(
                  `Are you sure you want to delete the rule "${rule.name}"? It will be removed from every member's account.`,
                );
                if (!yes) return;

                toast.promise(
                  async () => {
                    const result = await deleteOrganizationRuleAction({
                      id: rule.id,
                    });
                    if (result?.serverError) {
                      throw new Error(result.serverError);
                    }
                    mutate();
                  },
                  {
                    loading: "Deleting rule...",
                    success: "Rule deleted",
                    error: (error) => `Error deleting rule. ${error.message}`,
                  },
                );
              }}
            >
              <Trash2Icon className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function Teams({
  organizationId,
  teams,
  mutate,
}: {
  organizationId: string;
  teams: { id: string; name: string; _count: { members: number } }[];
  mutate: () => void;
}) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsCreating(true);
    const result = await createOrganizationTeamAction({
      organizationId,
      name: trimmed,
    });
    setIsCreating(false);

    if (result?.serverError) {
      toastError({
        title: "Error creating team",
        description: result.serverError,
      });
      return;
    }

    setName("");
    toastSuccess({ description: "Team created" });
    mutate();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => (
          <Badge key={team.id} variant="secondary" className="gap-1.5 py-1">
            {team.name}
            <span className="text-muted-foreground">
              ({team._count.members})
            </span>
            <button
              type="button"
              aria-label={`Delete team ${team.name}`}
              onClick={async () => {
                const yes = confirm(
                  `Are you sure you want to delete the team "${team.name}"?`,
                );
                if (!yes) return;

                const result = await deleteOrganizationTeamAction({
                  id: team.id,
                });
                if (result?.serverError) {
                  toastError({
                    title: "Error deleting team",
                    description: result.serverError,
                  });
                  return;
                }
                toastSuccess({ description: "Team deleted" });
                mutate();
              }}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        {teams.length === 0 && (
          <span className="text-sm text-muted-foreground">No teams yet.</span>
        )}
      </div>

      <div className="flex gap-2 max-w-sm">
        <Input
          value={name}
          placeholder="e.g. Engineering"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCreate();
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={onCreate}
          loading={isCreating}
          disabled={!name.trim()}
        >
          Add Team
        </Button>
      </div>
    </div>
  );
}
