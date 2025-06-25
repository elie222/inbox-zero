"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ScheduledAction } from "@prisma/client";

interface ScheduledActionWithDetails extends ScheduledAction {
  emailAccount: {
    id: string;
    email: string;
    name: string | null;
  };
  executedRule: {
    rule: {
      id: string;
      name: string;
    } | null;
  } | null;
  error?: string | null;
}

const actionTypeColors = {
  LABEL: "bg-purple-100 text-purple-800",
  ARCHIVE: "bg-orange-100 text-orange-800",
  REPLY: "bg-blue-100 text-blue-800",
  SEND_EMAIL: "bg-green-100 text-green-800",
  FORWARD: "bg-indigo-100 text-indigo-800",
  DRAFT_EMAIL: "bg-teal-100 text-teal-800",
  MARK_SPAM: "bg-red-100 text-red-800",
  CALL_WEBHOOK: "bg-gray-100 text-gray-800",
  MARK_READ: "bg-blue-100 text-blue-800",
  TRACK_THREAD: "bg-yellow-100 text-yellow-800",
  DIGEST: "bg-pink-100 text-pink-800",
};

const ACTION_LABELS = {
  LABEL: "Label",
  ARCHIVE: "Archive",
  REPLY: "Reply",
  SEND_EMAIL: "Send Email",
  FORWARD: "Forward",
  DRAFT_EMAIL: "Draft Email",
  MARK_SPAM: "Mark Spam",
  CALL_WEBHOOK: "Call Webhook",
  MARK_READ: "Mark Read",
  TRACK_THREAD: "Track Thread",
  DIGEST: "Digest",
} as const;

const STATUS_LABELS = {
  PENDING: "Pending",
  EXECUTING: "Executing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
} as const;

export function ScheduledActionsTable() {
  const [emailFilter, setEmailFilter] = useState("");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actions, setActions] = useState<ScheduledActionWithDetails[]>([]);
  const [allRules, setAllRules] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  const fetchScheduledActions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (emailFilter) params.append("email", emailFilter);
      if (ruleFilter && ruleFilter !== "all")
        params.append("search", ruleFilter);

      const response = await fetch(`/api/admin/scheduled-actions?${params}`);
      if (response.ok) {
        const data = await response.json();
        console.log("API Response:", data); // Debug log
        console.log("All rules:", data.allRules); // Debug log
        setActions(data.scheduledActions || []);
        setAllRules(data.allRules || []);
        setTotalCount(data.totalCount || 0);
        setStatusCounts(data.statusCounts || {});
      }
    } catch (error) {
      console.error("Failed to fetch scheduled actions:", error);
      setActions([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, emailFilter, ruleFilter]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchScheduledActions();
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [fetchScheduledActions]);

  const handleCancelAction = async (actionId: string) => {
    try {
      const response = await fetch(
        `/api/admin/scheduled-actions/${actionId}/cancel`,
        {
          method: "POST",
        },
      );
      if (response.ok) {
        await fetchScheduledActions();
      }
    } catch (error) {
      console.error("Failed to cancel action:", error);
    }
  };

  const handleRetryAction = async (actionId: string) => {
    try {
      const response = await fetch(
        `/api/admin/scheduled-actions/${actionId}/retry`,
        {
          method: "POST",
        },
      );
      if (response.ok) {
        await fetchScheduledActions();
      }
    } catch (error) {
      console.error("Failed to retry action:", error);
    }
  };

  const handleStatusClick = (action: ScheduledActionWithDetails) => {
    if (action.status === "FAILED" && action.error) {
      setSelectedError(String(action.error));
      setErrorModalOpen(true);
    }
  };

  const filteredActions = actions.filter((action) => {
    const matchesEmail =
      !emailFilter ||
      action.emailAccount.email
        ?.toLowerCase()
        .includes(emailFilter.toLowerCase());

    const matchesRule =
      ruleFilter === "all" ||
      !ruleFilter ||
      action.executedRule?.rule?.name === ruleFilter;

    const matchesStatus =
      statusFilter === "all" || action.status === statusFilter;

    return matchesEmail && matchesRule && matchesStatus;
  });

  return (
    <Card className="p-6">
      {/* Status Badges */}
      <div className="mb-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge
            variant={statusFilter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setStatusFilter("all")}
          >
            All ({totalCount})
          </Badge>
          {Object.entries(STATUS_LABELS).map(([status, label]) => {
            const count = statusCounts[status] || 0;
            return (
              <Badge
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                className={`cursor-pointer ${
                  status === "FAILED"
                    ? "hover:bg-red-100"
                    : status === "COMPLETED"
                      ? "hover:bg-green-100"
                      : status === "PENDING"
                        ? "hover:bg-yellow-100"
                        : status === "CANCELLED"
                          ? "hover:bg-gray-100"
                          : "hover:bg-blue-100"
                }`}
                onClick={() => setStatusFilter(status)}
              >
                {label} ({count})
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <Input
          name="email"
          type="email"
          placeholder="Filter by email..."
          registerProps={{
            value: emailFilter,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              setEmailFilter(e.target.value),
          }}
          className="w-64"
        />

        <Select value={ruleFilter} onValueChange={setRuleFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Filter by rule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rules</SelectItem>
            {allRules.length === 0 ? (
              <SelectItem value="no-rules" disabled>
                No rules found
              </SelectItem>
            ) : (
              allRules.map((rule) => (
                <SelectItem key={rule.id} value={rule.name}>
                  {rule.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Button onClick={fetchScheduledActions} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email Account</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Action Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled For</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredActions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {emailFilter || ruleFilter || statusFilter !== "all"
                    ? "No scheduled actions match your filters"
                    : "No scheduled actions found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredActions.map((action) => (
                <TableRow key={action.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {action.emailAccount.email}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {action.emailAccount.name || "No name"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {action.executedRule?.rule?.name || "Deleted rule"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Thread: {action.threadId.slice(-8)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        actionTypeColors[
                          action.actionType as keyof typeof actionTypeColors
                        ] || "bg-gray-100 text-gray-800"
                      }
                    >
                      {ACTION_LABELS[
                        action.actionType as keyof typeof ACTION_LABELS
                      ] || action.actionType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        action.status === "COMPLETED"
                          ? "default"
                          : action.status === "FAILED"
                            ? "destructive"
                            : action.status === "CANCELLED"
                              ? "secondary"
                              : "outline"
                      }
                      className={
                        action.status === "FAILED" && action.error
                          ? "cursor-pointer hover:opacity-80"
                          : ""
                      }
                      onClick={() => handleStatusClick(action)}
                    >
                      {STATUS_LABELS[
                        action.status as keyof typeof STATUS_LABELS
                      ] || action.status}
                      {action.status === "FAILED" && action.error && " ⚠️"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {new Date(action.scheduledFor).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(action.scheduledFor), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {action.status !== "COMPLETED" ? (
                      <div className="flex gap-2">
                        {(action.status === "PENDING" ||
                          action.status === "EXECUTING" ||
                          action.status === "FAILED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelAction(action.id)}
                            disabled={isLoading}
                          >
                            Cancel
                          </Button>
                        )}
                        {(action.status === "FAILED" ||
                          action.status === "CANCELLED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryAction(action.id)}
                            disabled={isLoading}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Error Modal */}
      <Dialog open={errorModalOpen} onOpenChange={setErrorModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Action Error Details</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm text-red-800">
                {selectedError}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
