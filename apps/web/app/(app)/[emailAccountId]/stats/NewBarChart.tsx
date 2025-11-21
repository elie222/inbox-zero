import {
  type config,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface NewBarChartProps {
  data: any[];
  config: config;
  dataKeys?: string[];
  xAxisKey?: string;
  xAxisFormatter?: (value: any) => string;
  activeCharts?: string[];
}

export function NewBarChart({
  data,
  config,
  dataKeys,
  xAxisKey = "date",
  xAxisFormatter = (value) => {
    const date = new Date(value);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  },
  activeCharts,
}: NewBarChartProps) {
  const keys = dataKeys || Object.keys(config);

  return (
    <ChartContainer config={config} className="aspect-auto h-[250px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
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
          tickFormatter={xAxisFormatter}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0];
            return (
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="mb-2 font-medium">
                  {new Date(data.payload[xAxisKey]).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
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
      </BarChart>
    </ChartContainer>
  );
}
