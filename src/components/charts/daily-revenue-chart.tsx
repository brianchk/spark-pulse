"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { usePulseQuery } from "@/lib/hooks/use-pulse-query";
import { formatCurrency } from "@/lib/utils/formatters";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface DailyTotal {
  date: string;
  net_revenue: number;
  transaction_count: number;
}

interface DailyTotalResponse {
  data: DailyTotal[];
  period: string;
  total_revenue: number;
  total_transactions: number;
}

export function DailyRevenueChart({ days = 30 }: { days?: number }) {
  const { data, isLoading, error } = usePulseQuery<DailyTotalResponse>(
    ["sales", "daily-total"],
    { endpoint: "sales/daily-total", params: { days } }
  );

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">Loading sales data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-destructive/50 bg-card">
        <p className="text-destructive">Failed to load sales data</p>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">No sales data available</p>
      </div>
    );
  }

  const dates = data.data.map((d) => {
    const dt = new Date(d.date + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
  const revenues = data.data.map((d) => d.net_revenue);
  const weekendIndices = new Set(
    data.data
      .map((d, i) => {
        const day = new Date(d.date + "T00:00:00").getDay();
        return day === 0 || day === 6 ? i : -1;
      })
      .filter((i) => i >= 0)
  );

  const option: echarts.EChartsCoreOption = {
    grid: { left: 80, right: 20, top: 40, bottom: 40 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const p = (params as { name: string; value: number }[])[0];
        return `<strong>${p.name}</strong><br/>NR: ${formatCurrency(p.value)}`;
      },
    },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { interval: "auto", rotate: 0 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (v: number) => formatCurrency(v, true),
      },
    },
    series: [
      {
        type: "bar",
        data: revenues.map((v, i) => ({
          value: v,
          itemStyle: {
            color: weekendIndices.has(i) ? "hsl(220 70% 55%)" : "hsl(220 70% 45%)",
            borderRadius: [3, 3, 0, 0],
          },
        })),
        animationDuration: 600,
        animationEasing: "cubicInOut",
      },
    ],
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-card-foreground">
          Daily Net Revenue — Last {days} Days
        </h3>
        <p className="text-sm text-muted-foreground">
          Total: {formatCurrency(data.total_revenue)} across {data.total_transactions.toLocaleString()} transactions
        </p>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 360 }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
