import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTopWeeklyUsageCosts } from "@/utils/redis/usage";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export async function AdminTopSpenders() {
  const topSpenders = await getTopWeeklyUsageCosts({ limit: 25 });

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Top Spenders</CardTitle>
        <CardDescription>
          Last 7 days (same window as spend limiter)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topSpenders.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topSpenders.map((spender, index) => (
                <TableRow key={spender.email}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className="font-mono text-xs sm:text-sm">
                    {spender.email}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencyFormatter.format(spender.cost)}
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
      </CardContent>
    </Card>
  );
}
