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

interface WeeklyYoYResponse {
  weeks: string[];
  cy: Record<string, number[]>;
  py: Record<string, number[]>;
  period_cy: string;
  period_py: string;
  stores: string[];
}

export function WeeklyYoYChart({ weeks = 20 }: { weeks?: number }) {
  const { data, isLoading, error } = usePulseQuery<WeeklyYoYResponse>(
    ["sales", "weekly-yoy"],
    { endpoint: "sales/weekly-yoy", params: { weeks } }
  );

  if (isLoading) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">Loading weekly comparison...</p>
      </div>
    );
  }

  if (error || !data || data.weeks.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">{error ? "Failed to load data" : "No data"}</p>
      </div>
    );
  }

  // Use official store order, filtered to stores present in data
  const stores = RETAIL_STORE_ORDER.filter((s) => data.stores.includes(s));

  // Build series: for each store, PY (shadow) first, then CY (solid)
  // PY bars are stacked together as "py" stack, CY bars as "cy" stack
  // ECharts renders stacks side-by-side when using barGap
  const pySeries = stores.map((store) => ({
    name: `${store} PY`,
    type: "bar" as const,
    stack: "py",
    data: data.py[store] || data.weeks.map(() => 0),
    itemStyle: { color: getStoreColor(store).priorYear },
    emphasis: { disabled: true },
    animationDuration: 400,
    animationEasing: "cubicInOut" as const,
  }));

  const cySeries = stores.map((store) => ({
    name: store,
    type: "bar" as const,
    stack: "cy",
    data: data.cy[store] || data.weeks.map(() => 0),
    itemStyle: { color: getStoreColor(store).solid },
    animationDuration: 600,
    animationEasing: "cubicInOut" as const,
  }));

  const option: echarts.EChartsCoreOption = {
    grid: { left: 80, right: 20, top: 60, bottom: 40 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string }[];
        const weekLabel = (params as { name: string }[])[0]?.name;

        // Separate CY and PY items
        const cyItems = items.filter((i) => !i.seriesName.endsWith(" PY") && i.value > 0);
        const pyItems = items.filter((i) => i.seriesName.endsWith(" PY") && i.value > 0);

        const cyTotal = cyItems.reduce((s, i) => s + i.value, 0);
        const pyTotal = pyItems.reduce((s, i) => s + i.value, 0);
        const yoyPct = pyTotal > 0 ? ((cyTotal - pyTotal) / pyTotal) * 100 : 0;
        const yoySign = yoyPct >= 0 ? "+" : "";

        let html = `<strong>${weekLabel}</strong><br/>`;
        html += `<strong>CY: ${formatCurrency(cyTotal)}</strong>`;
        if (pyTotal > 0) {
          html += ` <span style="color:${yoyPct >= 0 ? "#4ade80" : "#f87171"}">(${yoySign}${yoyPct.toFixed(1)}% YoY)</span>`;
        }
        html += "<br/>";

        const cyLines = cyItems
          .sort((a, b) => b.value - a.value)
          .map(
            (i) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${i.color};margin-right:6px;"></span>${i.seriesName}: ${formatCurrency(i.value)}`
          );
        html += cyLines.join("<br/>");

        if (pyTotal > 0) {
          html += `<br/><span style="color:#999">PY: ${formatCurrency(pyTotal)}</span>`;
        }
        return html;
      },
    },
    legend: {
      data: stores, // Only show CY store names in legend (not "QRC PY")
      top: 0,
      textStyle: { fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: data.weeks,
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (v: number) => formatCurrency(v, true) },
    },
    series: [...pySeries, ...cySeries],
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-card-foreground">
          Weekly Turnover by Shop — YoY Comparison
        </h3>
        <p className="text-sm text-muted-foreground">
          Solid = current year, translucent = prior year same week
        </p>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 460 }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
