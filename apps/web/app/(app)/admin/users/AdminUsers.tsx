"use client";

import { useCallback, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import { TablePagination } from "@/components/TablePagination";
import { MutedText } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { ACTIVITY_BADGE } from "@/utils/member-activity";

// Only filters the API can express in SQL. Activity status is derived after the
// page is fetched, so filtering on it here would only filter the current page.
const FILTER_OPTIONS = [
  { value: "all", label: "All users" },
  { value: "disconnected", label: "Disconnected" },
  { value: "errors", label: "In error state" },
];

export function AdminUsers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number.parseInt(searchParams.get("page") || "1");

  // Page lives in the URL, so a new query has to reset it. Otherwise searching
  // from page 3 asks for page 3 of a one-page result and shows "no users",
  // with TablePagination hidden and no way back except editing the URL.
  const resetToFirstPage = useCallback(() => {
    if (page !== 1) router.replace("?page=1");
  }, [page, router]);

  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data, isLoading, error } = useAdminUsers({
    page,
    search: submittedSearch,
    filter,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedSearch(search.trim());
            resetToFirstPage();
          }}
        >
          <Input
            placeholder="Search by email or name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" variant="outline" size="sm">
            <SearchIcon className="mr-2 size-4" />
            Search
          </Button>
        </form>

        <Select
          value={filter}
          onValueChange={(value) => {
            setFilter(value);
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-64" />}
      >
        {data &&
          (data.results.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>User</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead className="text-right">Mailboxes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((user) => (
                    <UserRow key={user.id} user={user} />
                  ))}
                </TableBody>
              </Table>
              <TablePagination totalPages={data.totalPages} />
            </>
          ) : (
            <MutedText>No users match this search.</MutedText>
          ))}
      </LoadingContent>
    </div>
  );
}

type AdminUser = NonNullable<
  ReturnType<typeof useAdminUsers>["data"]
>["results"][number];

function UserRow({ user }: { user: AdminUser }) {
  const [expanded, setExpanded] = useState(false);
  const badge = user.status ? ACTIVITY_BADGE[user.status] : null;

  return (
    <>
      <TableRow>
        <TableCell>
          {user.emailAccounts.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded((current) => !current)}
              aria-label={expanded ? "Hide mailboxes" : "Show mailboxes"}
            >
              {expanded ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
            </Button>
          )}
        </TableCell>
        <TableCell>
          <div className="font-medium">{user.email}</div>
          {user.name && <MutedText>{user.name}</MutedText>}
        </TableCell>
        <TableCell>{formatDate(user.createdAt)}</TableCell>
        <TableCell>{formatDate(user.lastLogin)}</TableCell>
        <TableCell className="text-right">
          {user.emailAccounts.length}
        </TableCell>
        <TableCell>
          {badge ? (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          {user.errorCount > 0 ? (
            <Badge variant="red">{user.errorCount}</Badge>
          ) : (
            <MutedText>0</MutedText>
          )}
        </TableCell>
      </TableRow>

      {expanded &&
        user.emailAccounts.map((emailAccount) => {
          const accountBadge = ACTIVITY_BADGE[emailAccount.status];
          return (
            <TableRow key={emailAccount.id} className="bg-muted/40">
              <TableCell />
              <TableCell className="pl-8">
                <div>{emailAccount.email}</div>
                <MutedText>{emailAccount.provider ?? "unknown"}</MutedText>
              </TableCell>
              <TableCell colSpan={2}>
                <MutedText>
                  Last processed {formatDate(emailAccount.lastProcessedEmailAt)}
                </MutedText>
              </TableCell>
              <TableCell className="text-right">
                {emailAccount.rulesCount} rules
              </TableCell>
              <TableCell>
                <Badge variant={accountBadge.variant}>
                  {accountBadge.label}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <MutedText>
                  Watch {formatDate(emailAccount.watchExpiresAt)}
                </MutedText>
              </TableCell>
            </TableRow>
          );
        })}
    </>
  );
}

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
