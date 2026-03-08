"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { usePulseQuery } from "@/lib/hooks/use-pulse-query";
import { formatCurrency } from "@/lib/utils/formatters";
import { getStoreColor, RETAIL_STORE_ORDER } from "@/lib/constants/store-colors";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface DailySale {
  date: string;
  store_id: string;
  store_name: string;
  net_revenue: number;
  transaction_count: number;
}

interface DailySalesResponse {
  data: DailySale[];
  period: string;
  stores: string[];
}

export function DailyRevenueByStoreChart({ days = 30 }: { days?: number }) {
  const { data, isLoading, error } = usePulseQuery<DailySalesResponse>(
    ["sales", "daily"],
    { endpoint: "sales/daily", params: { days } }
  );

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">Loading store breakdown...</p>
      </div>
    );
  }

  if (error || !data || data.data.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">{error ? "Failed to load data" : "No data"}</p>
      </div>
    );
  }

  const dateSet = [...new Set(data.data.map((d) => d.date))].sort();
  // Use official store order, filtered to stores present in data
  const stores = RETAIL_STORE_ORDER.filter((s) => data.stores.includes(s));

  const dateLabels = dateSet.map((d) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  // Build lookup: date → store → revenue
  const lookup = new Map<string, Map<string, number>>();
  for (const row of data.data) {
    if (!lookup.has(row.date)) lookup.set(row.date, new Map());
    const byStore = lookup.get(row.date)!;
    byStore.set(row.store_name, (byStore.get(row.store_name) || 0) + row.net_revenue);
  }

  const series = stores.map((store) => ({
    name: store,
    type: "bar" as const,
    stack: "revenue",
    data: dateSet.map((d) => lookup.get(d)?.get(store) || 0),
    itemStyle: { color: getStoreColor(store).solid },
    animationDuration: 600,
    animationEasing: "cubicInOut" as const,
  }));

  const option: echarts.EChartsCoreOption = {
    grid: { left: 80, right: 20, top: 50, bottom: 40 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string }[];
        const title = items[0] ? `<strong>${(params as { name: string }[])[0]?.name}</strong>` : "";
        const lines = items
          .filter((i) => i.value > 0)
          .sort((a, b) => b.value - a.value)
          .map(
            (i) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${i.color};margin-right:6px;"></span>${i.seriesName}: ${formatCurrency(i.value)}`
          );
        const total = items.reduce((s, i) => s + i.value, 0);
        return `${title}<br/>${lines.join("<br/>")}<br/><strong>Total: ${formatCurrency(total)}</strong>`;
      },
    },
    legend: {
      data: stores,
      top: 0,
      textStyle: { fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: dateLabels,
      axisLabel: { interval: "auto" },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (v: number) => formatCurrency(v, true) },
    },
    series,
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-card-foreground">
          Revenue by Store — Last {days} Days
        </h3>
        <p className="text-sm text-muted-foreground">Stacked daily breakdown across retail stores</p>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 400 }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
