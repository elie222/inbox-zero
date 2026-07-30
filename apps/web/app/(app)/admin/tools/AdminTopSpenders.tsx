"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAdminTopSpenders } from "@/hooks/useAdminTopSpenders";
import type { GetAdminTopSpendersResponse } from "@/app/api/admin/top-spenders/route";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat("en-US");
const SUB_CENT_USD = 0.01;

export function AdminTopSpenders() {
  const { data, isLoading, error } = useAdminTopSpenders();
  const topSpenders = data?.topSpenders ?? [];
  const modelSpend = data?.modelSpend ?? [];

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Top Spenders</CardTitle>
        <CardDescription>
          Last 7 days. Nano-Limited comes from Redis; User Accounts is connected
          email accounts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoadingContent loading={isLoading} error={error}>
          <div className="space-y-8">
            {topSpenders.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Email Account ID</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>User Accounts</TableHead>
                    <TableHead>Top Models</TableHead>
                    <TableHead>Nano-Limited</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSpenders.map((spender, index) => (
                    <TableRow
                      key={
                        ("userId" in spender
                          ? spender.userId
                          : spender.email) ?? index
                      }
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {spender.emailAccountId ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs sm:text-sm">
                        {spender.email ?? "-"}
                      </TableCell>
                      <TableCell>
                        {spender.userEmailAccountCount ?? "-"}
                      </TableCell>
                      <TableCell>
                        <ModelSpendList modelSpend={spender.modelSpend} />
                      </TableCell>
                      <TableCell>
                        {spender.nanoLimitedBySpendGuard ? (
                          <Badge variant="red">Yes</Badge>
                        ) : (
                          <Badge variant="green">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCost(spender.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No usage cost recorded in the past 7 days.
              </p>
            )}

            <section className="space-y-3">
              <div>
                <h3 className="font-medium text-sm">Spend by Model</h3>
                <p className="text-muted-foreground text-sm">
                  Tinybird platform spend.
                </p>
              </div>

              {modelSpend.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelSpend.map((model, index) => (
                      <TableRow key={`${model.provider}:${model.model}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {model.provider}
                        </TableCell>
                        <TableCell className="font-mono text-xs sm:text-sm">
                          {model.model}
                        </TableCell>
                        <TableCell className="text-right">
                          {numberFormatter.format(model.calls)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCost(model.cost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No model spend recorded in Tinybird for this window.
                </p>
              )}
            </section>
          </div>
        </LoadingContent>
      </CardContent>
    </Card>
  );
}

type TopSpender = GetAdminTopSpendersResponse["topSpenders"][number];
type ModelSpend = TopSpender["modelSpend"];

function ModelSpendList({ modelSpend }: { modelSpend: ModelSpend }) {
  if (!modelSpend.length) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  return (
    <div className="space-y-1">
      {modelSpend.map((model) => (
        <div
          className="flex max-w-72 justify-between gap-3 text-xs"
          key={`${model.provider}:${model.model}`}
        >
          <span className="truncate font-mono">
            {model.provider}/{model.model}
          </span>
          <span className="shrink-0 tabular-nums">
            {formatCost(model.cost)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatCost(cost: number) {
  if (cost > 0 && cost < SUB_CENT_USD) return "<$0.01";

  return currencyFormatter.format(cost);
}
