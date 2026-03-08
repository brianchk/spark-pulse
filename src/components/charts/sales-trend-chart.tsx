"use client";

import { useState, useCallback, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { usePulseQuery } from "@/lib/hooks/use-pulse-query";
import { formatCurrency } from "@/lib/utils/formatters";
import { getStoreColor, getMaincatColor, RETAIL_STORE_ORDER } from "@/lib/constants/store-colors";
import { TrendDetailTable } from "./trend-detail-table";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

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

const POP_LABELS: Record<string, string> = { daily: "DoD", weekly: "WoW", monthly: "MoM" };

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
  const [focusedPeriod, setFocusedPeriod] = useState<number | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const syncingLegend = useRef(false);
  const hoveredSeriesRef = useRef<string | null>(null);

  const periods = GRANULARITY_OPTIONS.find((o) => o.value === granularity)!.defaultPeriods;
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

  const handleChartClick = useCallback(
    (params: { dataIndex: number }) => {
      setFocusedPeriod((prev) => (prev === params.dataIndex ? null : params.dataIndex));
    },
    []
  );

  const handleGroupHover = useCallback((group: string | null) => {
    setHoveredGroup(group);
  }, []);

  // Sync PY series visibility + table when legend is toggled
  const handleLegendChange = useCallback(
    (params: { selected: Record<string, boolean> }, chart: { dispatchAction: (a: { type: string; name: string }) => void }) => {
      if (syncingLegend.current) return;
      syncingLegend.current = true;

      // Toggle corresponding PY series to match CY
      for (const [name, isSelected] of Object.entries(params.selected)) {
        if (!name.endsWith(" PY")) {
          chart.dispatchAction({
            type: isSelected ? "legendSelect" : "legendUnSelect",
            name: `${name} PY`,
          });
        }
      }

      // Update hidden set for table filtering
      const hidden = new Set<string>();
      for (const [name, isSelected] of Object.entries(params.selected)) {
        if (!isSelected && !name.endsWith(" PY")) hidden.add(name);
      }
      setHiddenGroups(hidden);

      syncingLegend.current = false;
    },
    []
  );

  // Track which bar segment the mouse is over (ref avoids re-renders)
  const handleSeriesOver = useCallback((params: { seriesName: string }) => {
    hoveredSeriesRef.current = params.seriesName;
  }, []);
  const handleSeriesOut = useCallback(() => {
    hoveredSeriesRef.current = null;
  }, []);

  // Controls bar
  const controls = (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      <div className="flex rounded-md border border-border">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setGranularity(opt.value);
              setFocusedPeriod(null);
              setHiddenGroups(new Set());
            }}
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

      <div className="flex rounded-md border border-border">
        {(["store", "maincat"] as Breakdown[]).map((opt) => (
          <button
            key={opt}
            onClick={() => {
              setBreakdown(opt);
              setFocusedPeriod(null);
              setHiddenGroups(new Set());
            }}
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

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sameStore}
          onChange={(e) => {
            setSameStore(e.target.checked);
            setFocusedPeriod(null);
          }}
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

  const groups =
    breakdown === "maincat"
      ? data.categories ?? Object.keys(data.cy).sort()
      : RETAIL_STORE_ORDER.filter((s) => (data.stores ?? []).includes(s));

  const getColor = breakdown === "maincat" ? getMaincatColor : getStoreColor;
  const displayLabels = data.labels.map((l) => formatDateLabel(l, data.granularity));

  // Build series data with focus/hover opacity
  const makeData = (values: number[], groupName: string, isPY: boolean) => {
    if (!hoveredGroup && focusedPeriod === null) return values;

    return values.map((v, i) => {
      let dim = false;
      if (hoveredGroup) {
        dim = groupName !== hoveredGroup;
      } else if (focusedPeriod !== null) {
        dim = i !== focusedPeriod;
      }
      if (!dim) return v;
      return { value: v, itemStyle: { opacity: isPY ? 0.05 : 0.1 } };
    });
  };

  const pySeries = groups.map((g) => ({
    name: `${g} PY`,
    type: "bar" as const,
    stack: "py",
    data: makeData(data.py[g] || data.labels.map(() => 0), g, true),
    itemStyle: { color: getColor(g).priorYear },
    emphasis: { disabled: true },
    cursor: "pointer" as const,
    animationDuration: 400,
    animationEasing: "cubicInOut" as const,
  }));

  const cySeries = groups.map((g) => ({
    name: g,
    type: "bar" as const,
    stack: "cy",
    data: makeData(data.cy[g] || data.labels.map(() => 0), g, false),
    itemStyle: { color: getColor(g).solid },
    label: {
      show: true,
      position: "inside" as const,
      fontSize: 9,
      color: "#fff",
      textShadowColor: "rgba(0,0,0,0.4)",
      textShadowBlur: 2,
      formatter: (params: { value: number | { value: number } }) => {
        const v = typeof params.value === "number" ? params.value : params.value?.value ?? 0;
        return v >= 1000 ? Math.round(v / 1000).toString() : "";
      },
    },
    cursor: "pointer" as const,
    animationDuration: 600,
    animationEasing: "cubicInOut" as const,
  }));

  // Auto-zoom: show most recent bars when there are too many for the width.
  // Each period has 2 stacked bars (CY+PY) side by side, so ~40px per period is comfortable.
  // On narrow screens this naturally shows fewer periods; on wide screens, all fit.
  const MIN_PX_PER_PERIOD = 40;
  const chartUsableWidth = typeof window !== "undefined" ? Math.min(window.innerWidth - 120, 1200) : 900;
  const maxVisiblePeriods = Math.floor(chartUsableWidth / MIN_PX_PER_PERIOD);
  const totalPeriods = displayLabels.length;
  const needsZoom = totalPeriods > maxVisiblePeriods;
  const zoomStart = needsZoom ? ((totalPeriods - maxVisiblePeriods) / totalPeriods) * 100 : 0;

  const option: echarts.EChartsCoreOption = {
    grid: { left: 80, right: 20, top: 60, bottom: needsZoom ? 70 : 40 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string; dataIndex: number; name: string }[];
        const label = items[0]?.name;
        const idx = items[0]?.dataIndex;

        const hovered = hoveredSeriesRef.current;
        const segmentName = hovered
          ? hovered.endsWith(" PY") ? hovered.slice(0, -3) : hovered
          : null;

        // --- Compact tooltip: hovering a specific bar segment ---
        if (segmentName) {
          const cyVal = data.cy[segmentName]?.[idx] || 0;
          const pyVal = data.py[segmentName]?.[idx] || 0;
          const yoyPct = pyVal > 0 ? ((cyVal - pyVal) / pyVal) * 100 : 0;
          const totalCy = groups.reduce((s, g) => s + (data.cy[g]?.[idx] || 0), 0);
          const share = totalCy > 0 ? (cyVal / totalCy) * 100 : 0;
          const prevCy = idx > 0 ? (data.cy[segmentName]?.[idx - 1] || 0) : 0;
          const popPct = prevCy > 0 ? ((cyVal - prevCy) / prevCy) * 100 : 0;
          const popLabel = POP_LABELS[granularity] || "PoP";
          const segColor = getColor(segmentName).solid;

          const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
          const pctColor = (v: number) => v >= 0 ? "var(--color-gain)" : "var(--color-loss)";

          let html = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${segColor};margin-right:6px"></span>`;
          html += `<strong>${segmentName}</strong> · ${label}<br/>`;
          html += `${formatCurrency(cyVal)}`;
          if (pyVal > 0) html += ` <span style="color:${pctColor(yoyPct)}">(${fmtPct(yoyPct)} YoY)</span>`;
          html += `<br/>`;
          const parts: string[] = [];
          if (idx > 0 && prevCy > 0) parts.push(`<span style="color:${pctColor(popPct)}">${fmtPct(popPct)} ${popLabel}</span>`);
          parts.push(`${share.toFixed(0)}% share`);
          html += parts.join(" · ");
          return html;
        }

        // --- Full tooltip: hovering x-axis area or between bars ---
        const cyItems = items.filter((i) => !i.seriesName.endsWith(" PY") && i.value > 0);
        const pyItems = items.filter((i) => i.seriesName.endsWith(" PY") && i.value > 0);
        const cyTotal = cyItems.reduce((s, i) => s + i.value, 0);
        const pyTotal = pyItems.reduce((s, i) => s + i.value, 0);
        const yoyPct = pyTotal > 0 ? ((cyTotal - pyTotal) / pyTotal) * 100 : 0;
        const yoyColor = yoyPct >= 0 ? "var(--color-gain)" : "var(--color-loss)";

        let html = `<strong>${label}</strong> <span style="color:#999">(avg/day)</span><br/>`;
        html += `<strong>CY: ${formatCurrency(cyTotal)}</strong>`;
        if (pyTotal > 0) {
          html += ` <span style="color:${yoyColor}">(${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%)</span>`;
        }
        html += "<br/>";
        const cyLines = cyItems
          .sort((a, b) => b.value - a.value)
          .map(
            (i) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${i.color};margin-right:6px"></span>${i.seriesName}: ${formatCurrency(i.value)}`
          );
        html += cyLines.join("<br/>");
        if (pyTotal > 0)
          html += `<br/><span style="color:#999">PY total: ${formatCurrency(pyTotal)}</span>`;
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
      axisLabel: {
        interval: granularity === "daily" ? "auto" : 0,
        rotate: granularity === "daily" ? 45 : 0,
      },
    },
    yAxis: {
      type: "value",
      name: "Daily Avg NR",
      nameTextStyle: { fontSize: 11, padding: [0, 0, 0, 40] },
      axisLabel: { formatter: (v: number) => formatCurrency(v, true) },
    },
    dataZoom: needsZoom
      ? [
          {
            type: "slider",
            start: zoomStart,
            end: 100,
            bottom: 8,
            height: 20,
            borderColor: "transparent",
            backgroundColor: "rgba(255,255,255,0.05)",
            fillerColor: "rgba(255,255,255,0.08)",
            handleSize: "60%",
            textStyle: { fontSize: 10, color: "#888" },
          },
          { type: "inside", start: zoomStart, end: 100 },
        ]
      : undefined,
    series: [...pySeries, ...cySeries],
  };

  // Compute CY total across all periods for subtitle
  const cyGrandTotal = data.labels.reduce((total, _, i) => {
    return total + groups.reduce((s, g) => s + (data.cy[g]?.[i] || 0), 0);
  }, 0);
  const avgPerPeriod = cyGrandTotal / data.labels.length;

  const focusedLabel =
    focusedPeriod !== null ? formatDateLabel(data.labels[focusedPeriod], data.granularity) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-card-foreground">Sales Trend — YoY Comparison</h3>
          <p className="text-sm text-muted-foreground">
            Daily average: {formatCurrency(avgPerPeriod)} &middot; {data.period_cy}
            {sameStore && " \u00b7 Same store (excl. PP, MG)"}
            {breakdown === "maincat" && " \u00b7 By category"}
          </p>
        </div>
      </div>
      {controls}
      <ReactEChartsCore
        key={`${breakdown}-${groups.length}`}
        echarts={echarts}
        option={option}
        style={{ height: 460 }}
        lazyUpdate
        onEvents={{
          click: handleChartClick,
          legendselectchanged: handleLegendChange,
          mouseover: handleSeriesOver,
          mouseout: handleSeriesOut,
        }}
      />
      <TrendDetailTable
        data={data}
        groups={hiddenGroups.size > 0 ? groups.filter((g) => !hiddenGroups.has(g)) : groups}
        getColor={getColor}
        focusedPeriod={focusedPeriod}
        focusedLabel={focusedLabel}
        granularity={granularity}
        onGroupHover={handleGroupHover}
      />
    </div>
  );
}
