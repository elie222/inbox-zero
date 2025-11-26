import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

interface BarChartProps {
  data: { [key: string]: string | number }[];
  config: ChartConfig;
  dataKeys?: string[];
  xAxisKey?: string;
  xAxisFormatter?: (value: string) => string;
  activeCharts?: string[];
  period?: "day" | "week" | "month" | "year";
}

export function BarChart({
  data,
  config,
  dataKeys,
  xAxisKey = "date",
  xAxisFormatter,
  activeCharts,
  period,
}: BarChartProps) {
  const defaultFormatter = (value: any) => {
    const date = new Date(value);

    if (period === "year") {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
      });
    }

    if (period === "month") {
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }

    if (period === "week" || period === "day") {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatter = xAxisFormatter || defaultFormatter;
  const keys = dataKeys || Object.keys(config);

  return (
    <ChartContainer config={config} className="aspect-auto h-[250px] w-full">
      <RechartsBarChart
        accessibilityLayer
        data={data}
        margin={{ left: 12, right: 12 }}
      >
        <defs>
          {keys.map((key) => (
            <linearGradient
              key={key}
              id={`${key}Gradient`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={config[key].color}
                stopOpacity={0.8}
              />
              <stop
                offset="100%"
                stopColor={config[key].color}
                stopOpacity={0.3}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={formatter}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0];
            const date = new Date(data.payload[xAxisKey]);

            let dateFormat: Intl.DateTimeFormatOptions;
            if (period === "year") {
              dateFormat = { year: "numeric" };
            } else if (period === "month") {
              dateFormat = { month: "short", year: "numeric" };
            } else {
              dateFormat = { month: "short", day: "numeric", year: "numeric" };
            }

            return (
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="mb-2 font-medium">
                  {date.toLocaleDateString("en-US", dateFormat)}
                </p>
                {payload.map((entry) => (
                  <div
                    key={entry.dataKey}
                    className="flex items-center gap-2 py-0.5"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          config[entry.dataKey as keyof typeof config]?.color,
                      }}
                    />
                    <span className="text-muted-foreground">
                      {config[entry.dataKey as keyof typeof config]?.label}:
                    </span>
                    <span className="ml-auto font-medium">{entry.value}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        {keys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`url(#${key}Gradient)`}
            color={config[key].color}
            radius={[4, 4, 0, 0]}
            animationDuration={750}
            animationBegin={0}
            hide={activeCharts ? !activeCharts.includes(key) : false}
          />
        ))}
      </RechartsBarChart>
    </ChartContainer>
  );
}
