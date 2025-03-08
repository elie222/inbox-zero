import { ArchiveIcon, InboxIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/utils";

function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className: string;
  indicatorClassName: string;
}) {
  return (
    <div className={cn("relative h-2 rounded-full bg-gray-200", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-full bg-blue-500",
          indicatorClassName,
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function EmailStats({
  stats,
}: {
  stats: {
    total: number;
    archived: number;
  };
}) {
  // Calculate inbox count (total - archived)
  const inboxCount = stats.total - stats.archived;
  // console.log("🚀 ~ EmailStats ~ stats:", stats)

  // Calculate total labeled count (sum of all label counts)
  // const labeledCount = Object.values(stats.labels).reduce(
  //   (sum, count) => sum + count,
  //   0,
  // );

  const chartData = [
    {
      label: "Inbox",
      value: inboxCount,
      percentage: stats.total > 0 ? (inboxCount / stats.total) * 100 : 0,
      icon: InboxIcon,
      color: "bg-blue-500",
    },
    {
      label: "Archived",
      value: stats.archived,
      percentage: stats.total > 0 ? (stats.archived / stats.total) * 100 : 0,
      icon: ArchiveIcon,
      color: "bg-green-500",
    },
    // {
    //   label: "Labeled",
    //   value: labeledCount,
    //   percentage: stats.total > 0 ? (labeledCount / stats.total) * 100 : 0,
    //   icon: Tag,
    //   color: "bg-yellow-500",
    // },
  ];

  // const topLabels = Object.entries(stats.labels)
  //   .sort(([, a], [, b]) => b - a)
  //   .slice(0, 5);

  return (
    <div className="mt-2 h-[600px] space-y-4 overflow-y-auto rounded-md border bg-muted/20 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Email Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.total.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Total emails processed
            </p>

            <div className="mt-4 space-y-4">
              {chartData.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <item.icon className="mr-1.5 h-3.5 w-3.5" />
                      <span>{item.label}</span>
                    </div>
                    <span className="font-medium">
                      {item.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={item.percentage}
                      className="h-2"
                      indicatorClassName={item.color}
                    />
                    <span className="w-10 text-xs text-muted-foreground">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Labels</CardTitle>
          </CardHeader>
          <CardContent>
            {topLabels.length > 0 ? (
              <div className="space-y-4">
                {topLabels.map(([label, count]) => (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center">
                        <Tag className="mr-1.5 h-3.5 w-3.5 text-yellow-500" />
                        <span>{label}</span>
                      </div>
                      <span className="font-medium">
                        {count.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={(count / labeledCount) * 100}
                        className="h-2"
                        indicatorClassName="bg-yellow-500"
                      />
                      <span className="w-10 text-xs text-muted-foreground">
                        {(count / labeledCount) * 100}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                No labels applied yet
              </div>
            )}
          </CardContent>
        </Card> */}
      </div>
    </div>
  );
}
