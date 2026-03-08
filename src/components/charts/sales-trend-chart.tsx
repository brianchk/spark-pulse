"use client";

import { useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { usePulseQuery } from "@/lib/hooks/use-pulse-query";
import { formatCurrency } from "@/lib/utils/formatters";
import { getStoreColor, getMaincatColor, RETAIL_STORE_ORDER } from "@/lib/constants/store-colors";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface TrendResponse {
  labels: string[];
  cy: Record<string, number[]>;
  py: Record<string, number[]>;
  period_cy: string;
  period_py: string;
  stores?: string[];
  categories?: string[];
  granularity: string;
  same_store: boolean;
  daily_average: boolean;
}

type Granularity = "daily" | "weekly" | "monthly";
type Breakdown = "store" | "maincat";

const GRANULARITY_OPTIONS: { value: Granularity; label: string; defaultPeriods: number }[] = [
  { value: "daily", label: "Daily", defaultPeriods: 60 },
  { value: "weekly", label: "Weekly", defaultPeriods: 20 },
  { value: "monthly", label: "Monthly", defaultPeriods: 12 },
];

function formatDateLabel(label: string, granularity: string): string {
  if (granularity === "daily") {
    const dt = new Date(label + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return label;
}

export function SalesTrendChart({ initialData }: { initialData?: TrendResponse | null }) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [sameStore, setSameStore] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown>("store");

  const periods = GRANULARITY_OPTIONS.find((o) => o.value === granularity)!.defaultPeriods;

  // Use server-prefetched data for the default state (weekly, all stores, store breakdown)
  const isDefaultState = granularity === "weekly" && !sameStore && breakdown === "store";

  const endpoint = breakdown === "maincat" ? "sales/trend/maincat" : "sales/trend";

  const { data: fetchedData, isLoading, error } = usePulseQuery<TrendResponse>(
    ["sales", "trend", granularity, String(sameStore), breakdown],
    {
      endpoint,
      params: { granularity, periods, same_store: sameStore ? "true" : "false" },
    },
    { enabled: !isDefaultState || !initialData }
  );

  const data = isDefaultState && initialData ? initialData : fetchedData;

  // Controls bar
  const controls = (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      {/* Granularity toggle */}
      <div className="flex rounded-md border border-border">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setGranularity(opt.value)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
              granularity === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Breakdown toggle */}
      <div className="flex rounded-md border border-border">
        {(["store", "maincat"] as Breakdown[]).map((opt) => (
          <button
            key={opt}
            onClick={() => setBreakdown(opt)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
              breakdown === opt
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt === "store" ? "By Store" : "By Category"}
          </button>
        ))}
      </div>

      {/* Same store toggle */}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sameStore}
          onChange={(e) => setSameStore(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span className={sameStore ? "text-foreground" : "text-muted-foreground"}>Same store</span>
      </label>
    </div>
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        {controls}
        <div className="flex h-[460px] items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !data || data.labels.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        {controls}
        <div className="flex h-[460px] items-center justify-center">
          <p className="text-muted-foreground">{error ? "Failed to load data" : "No data"}</p>
        </div>
      </div>
    );
  }

  // Resolve groups and color getter based on breakdown
  const groups =
    breakdown === "maincat"
      ? data.categories ?? Object.keys(data.cy).sort()
      : RETAIL_STORE_ORDER.filter((s) => (data.stores ?? []).includes(s));

  const getColor = breakdown === "maincat" ? getMaincatColor : getStoreColor;

  const displayLabels = data.labels.map((l) => formatDateLabel(l, data.granularity));

  // Build series: PY shadow bars + CY solid bars
  const pySeries = groups.map((g) => ({
    name: `${g} PY`,
    type: "bar" as const,
    stack: "py",
    data: data.py[g] || data.labels.map(() => 0),
    itemStyle: { color: getColor(g).priorYear },
    emphasis: { disabled: true },
    animationDuration: 400,
    animationEasing: "cubicInOut" as const,
  }));

  const cySeries = groups.map((g) => ({
    name: g,
    type: "bar" as const,
    stack: "cy",
    data: data.cy[g] || data.labels.map(() => 0),
    itemStyle: { color: getColor(g).solid },
    animationDuration: 600,
    animationEasing: "cubicInOut" as const,
  }));

  const option: echarts.EChartsCoreOption = {
    grid: { left: 80, right: 20, top: 60, bottom: 40 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string }[];
        const label = (params as { name: string }[])[0]?.name;

        const cyItems = items.filter((i) => !i.seriesName.endsWith(" PY") && i.value > 0);
        const pyItems = items.filter((i) => i.seriesName.endsWith(" PY") && i.value > 0);

        const cyTotal = cyItems.reduce((s, i) => s + i.value, 0);
        const pyTotal = pyItems.reduce((s, i) => s + i.value, 0);
        const yoyPct = pyTotal > 0 ? ((cyTotal - pyTotal) / pyTotal) * 100 : 0;
        const yoySign = yoyPct >= 0 ? "+" : "";
        const yoyColor = yoyPct >= 0 ? "#4ade80" : "#f87171";

        let html = `<strong>${label}</strong> <span style="color:#999">(avg/day)</span><br/>`;
        html += `<strong>CY: ${formatCurrency(cyTotal)}</strong>`;
        if (pyTotal > 0) {
          html += ` <span style="color:${yoyColor}">(${yoySign}${yoyPct.toFixed(1)}%)</span>`;
        }
        html += "<br/>";

        const cyLines = cyItems
          .sort((a, b) => b.value - a.value)
          .map(
            (i) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${i.color};margin-right:6px;"></span>${i.seriesName}: ${formatCurrency(i.value)}`
          );
        html += cyLines.join("<br/>");
        if (pyTotal > 0) html += `<br/><span style="color:#999">PY total: ${formatCurrency(pyTotal)}</span>`;
        return html;
      },
    },
    legend: {
      data: groups,
      top: 0,
      textStyle: { fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: displayLabels,
      axisLabel: { interval: granularity === "daily" ? "auto" : 0, rotate: granularity === "daily" ? 45 : 0 },
    },
    yAxis: {
      type: "value",
      name: "Daily Avg NR",
      nameTextStyle: { fontSize: 11, padding: [0, 0, 0, 40] },
      axisLabel: { formatter: (v: number) => formatCurrency(v, true) },
    },
    series: [...pySeries, ...cySeries],
  };

  // Compute CY total across all periods for subtitle
  const cyGrandTotal = data.labels.reduce((total, _, i) => {
    return total + groups.reduce((s, g) => s + (data.cy[g]?.[i] || 0), 0);
  }, 0);
  const avgPerPeriod = cyGrandTotal / data.labels.length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-card-foreground">Sales Trend — YoY Comparison</h3>
          <p className="text-sm text-muted-foreground">
            Daily average: {formatCurrency(avgPerPeriod)} &middot; {data.period_cy}
            {sameStore && " · Same store (excl. PP, MG)"}
            {breakdown === "maincat" && " · By category"}
          </p>
        </div>
      </div>
      {controls}
      <ReactEChartsCore echarts={echarts} option={option} style={{ height: 460 }} notMerge lazyUpdate />
    </div>
  );
}
