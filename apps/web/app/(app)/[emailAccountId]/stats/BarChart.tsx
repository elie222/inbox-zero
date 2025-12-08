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
  yAxisFormatter?: (value: number) => string;
  tooltipLabelFormatter?: (value: string | number) => string;
  tooltipValueFormatter?: (value: number) => string;
  activeCharts?: string[];
  period?: "day" | "week" | "month" | "year";
}

export function BarChart({
  data,
  config,
  dataKeys,
  xAxisKey = "date",
  xAxisFormatter,
  yAxisFormatter,
  tooltipLabelFormatter,
  tooltipValueFormatter,
  activeCharts,
  period,
}: BarChartProps) {
  const defaultFormatter = (value: string) => {
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
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={yAxisFormatter}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0];
            const xValue = data.payload[xAxisKey];

            // Use custom formatter if provided, otherwise try date formatting with fallback
            let label: string;
            if (tooltipLabelFormatter) {
              label = tooltipLabelFormatter(xValue);
            } else {
              const date = new Date(xValue);
              if (Number.isNaN(date.getTime())) {
                // Fallback for non-date values
                label = String(xValue);
              } else {
                let dateFormat: Intl.DateTimeFormatOptions;
                if (period === "year") {
                  dateFormat = { year: "numeric" };
                } else if (period === "month") {
                  dateFormat = { month: "short", year: "numeric" };
                } else {
                  dateFormat = {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  };
                }
                label = date.toLocaleDateString("en-US", dateFormat);
              }
            }

            return (
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="mb-2 font-medium">{label}</p>
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
                    <span className="ml-auto font-medium">
                      {tooltipValueFormatter
                        ? tooltipValueFormatter(entry.value as number)
                        : entry.value}
                    </span>
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
