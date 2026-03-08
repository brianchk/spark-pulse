"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils/formatters";
import type { StoreColor } from "@/lib/constants/store-colors";

const MIN_VISIBLE = 3;
const MOVER_THRESHOLD = 0.8; // show rows accounting for 80% of total absolute movement

const POP_LABELS: Record<string, string> = {
  daily: "DoD",
  weekly: "WoW",
  monthly: "MoM",
};

interface TableRow {
  name: string;
  cy: number;
  py: number;
  yoyDelta: number;
  yoyPct: number | null;
  popDelta: number | null;
  popPct: number | null;
  primaryDelta: number;
  share: number;
  color: string;
}

interface TrendDetailTableProps {
  data: {
    labels: string[];
    cy: Record<string, number[]>;
    py: Record<string, number[]>;
  };
  groups: string[];
  getColor: (name: string) => StoreColor;
  focusedPeriod: number | null;
  focusedLabel: string | null;
  granularity: string;
  onGroupHover: (group: string | null) => void;
}

export function TrendDetailTable({
  data,
  groups,
  getColor,
  focusedPeriod,
  focusedLabel,
  granularity,
  onGroupHover,
}: TrendDetailTableProps) {
  const [gainersExpanded, setGainersExpanded] = useState(false);
  const [declinersExpanded, setDeclinersExpanded] = useState(false);

  const primaryIsYoY = granularity !== "monthly";
  const popLabel = POP_LABELS[granularity] || "PoP";
  const primaryLabel = primaryIsYoY ? "YoY" : popLabel;
  const secondaryLabel = primaryIsYoY ? popLabel : "YoY";

  const { gainers, decliners, totalPy, totalYoyDelta, totalPopDelta, gainersCutCount, declinersCutCount } = useMemo(() => {
    const all: TableRow[] = [];
    const n = data.labels.length;

    for (const g of groups) {
      const cyArr = data.cy[g] || [];
      const pyArr = data.py[g] || [];

      let cy: number, py: number;
      if (focusedPeriod !== null) {
        cy = cyArr[focusedPeriod] || 0;
        py = pyArr[focusedPeriod] || 0;
      } else {
        cy = n > 0 ? cyArr.reduce((s, v) => s + v, 0) / n : 0;
        py = n > 0 ? pyArr.reduce((s, v) => s + v, 0) / n : 0;
      }

      // PoP: compare reference period vs previous period
      const refIdx = focusedPeriod ?? n - 1;
      const prevIdx = refIdx - 1;
      let popDelta: number | null = null;
      let popPct: number | null = null;
      if (prevIdx >= 0 && refIdx < n) {
        const refVal = cyArr[refIdx] || 0;
        const prevVal = cyArr[prevIdx] || 0;
        popDelta = refVal - prevVal;
        popPct = prevVal > 0 ? ((refVal - prevVal) / prevVal) * 100 : refVal > 0 ? 100 : null;
      }

      const yoyDelta = cy - py;
      const yoyPct = py > 0 ? (yoyDelta / py) * 100 : cy > 0 ? 100 : null;

      const primaryDelta = primaryIsYoY ? yoyDelta : (popDelta ?? yoyDelta);

      all.push({
        name: g,
        cy,
        py,
        yoyDelta,
        yoyPct,
        popDelta,
        popPct,
        primaryDelta,
        share: 0,
        color: getColor(g).solid,
      });
    }

    const tCy = all.reduce((s, r) => s + Math.max(r.cy, 0), 0);
    const tPy = all.reduce((s, r) => s + Math.max(r.py, 0), 0);
    for (const r of all) {
      r.share = tCy > 0 ? (Math.max(r.cy, 0) / tCy) * 100 : 0;
    }

    // Split by primary delta
    const g = all.filter((r) => r.primaryDelta >= 0).sort((a, b) => b.primaryDelta - a.primaryDelta);
    const d = all.filter((r) => r.primaryDelta < 0).sort((a, b) => a.primaryDelta - b.primaryDelta);

    // Totals
    const tYoyDelta = tCy - tPy;
    const n2 = data.labels.length;
    const refIdx2 = focusedPeriod ?? n2 - 1;
    const prevIdx2 = refIdx2 - 1;
    let tPopDelta: number | null = null;
    if (prevIdx2 >= 0 && refIdx2 < n2) {
      const refTotal = groups.reduce((s, grp) => s + ((data.cy[grp] || [])[refIdx2] || 0), 0);
      const prevTotal = groups.reduce((s, grp) => s + ((data.cy[grp] || [])[prevIdx2] || 0), 0);
      tPopDelta = refTotal - prevTotal;
    }

    // Compute significant movers — top rows accounting for 80% of total absolute movement
    const combined = [...g, ...d];
    const totalAbsDelta = combined.reduce((s, r) => s + Math.abs(r.primaryDelta), 0);
    const significantNames = new Set<string>();
    if (totalAbsDelta > 0) {
      const ranked = [...combined].sort((a, b) => Math.abs(b.primaryDelta) - Math.abs(a.primaryDelta));
      let cumulative = 0;
      for (const row of ranked) {
        significantNames.add(row.name);
        cumulative += Math.abs(row.primaryDelta);
        if (cumulative / totalAbsDelta >= MOVER_THRESHOLD) break;
      }
    } else {
      combined.forEach((r) => significantNames.add(r.name));
    }

    const gCut = Math.max(g.filter((r) => significantNames.has(r.name)).length, MIN_VISIBLE);
    const dCut = Math.max(d.filter((r) => significantNames.has(r.name)).length, MIN_VISIBLE);

    return {
      gainers: g, decliners: d, totalPy: tPy,
      totalYoyDelta: tYoyDelta, totalPopDelta: tPopDelta,
      gainersCutCount: gCut, declinersCutCount: dCut,
    };
  }, [data, groups, getColor, focusedPeriod, primaryIsYoY]);

  const totalYoyPct = totalPy > 0 ? (totalYoyDelta / totalPy) * 100 : null;
  const maxAbsDelta = Math.max(...[...gainers, ...decliners].map((r) => Math.abs(r.primaryDelta)), 1);

  // Subtotals per panel
  const computeSubtotals = (rows: TableRow[]) => ({
    cy: rows.reduce((s, r) => s + r.cy, 0),
    py: rows.reduce((s, r) => s + r.py, 0),
    yoyDelta: rows.reduce((s, r) => s + r.yoyDelta, 0),
    popDelta: rows.some((r) => r.popDelta !== null)
      ? rows.reduce((s, r) => s + (r.popDelta ?? 0), 0)
      : null,
    share: rows.reduce((s, r) => s + r.share, 0),
  });

  const gainersSub = computeSubtotals(gainers);
  const declinersSub = computeSubtotals(decliners);

  const deltaCell = (delta: number | null, pct: number | null, isPrimary: boolean) => {
    if (delta === null) return <span className="text-muted-foreground">{"\u2014"}</span>;
    const isGain = delta >= 0;
    const clr = isGain ? "#4ade80" : "#f87171";
    return (
      <div className={isPrimary ? "" : "opacity-50"}>
        <div className="tabular-nums" style={{ color: clr }}>
          {isGain ? "+" : "-"}
          {formatCurrency(Math.abs(delta))}
        </div>
        <div className="text-[10px] tabular-nums" style={{ color: clr }}>
          {pct !== null ? formatPercent(pct, true) : "\u2014"}
        </div>
      </div>
    );
  };

  const renderRow = (row: TableRow) => {
    const barWidth = Math.min((Math.abs(row.primaryDelta) / maxAbsDelta) * 100, 100);
    const isGain = row.primaryDelta >= 0;
    const barClr = isGain ? "#4ade80" : "#f87171";

    const primaryDelta = primaryIsYoY ? row.yoyDelta : row.popDelta;
    const primaryPct = primaryIsYoY ? row.yoyPct : row.popPct;
    const secondaryDelta = primaryIsYoY ? row.popDelta : row.yoyDelta;
    const secondaryPct = primaryIsYoY ? row.popPct : row.yoyPct;

    return (
      <tr
        key={row.name}
        className="border-b border-border/40 transition-colors hover:bg-muted/40"
        onMouseEnter={() => onGroupHover(row.name)}
        onMouseLeave={() => onGroupHover(null)}
      >
        <td className="p-1.5 text-center">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: row.color }} />
        </td>
        <td className="p-1.5 font-medium text-card-foreground">{row.name}</td>
        <td className="p-1.5 text-right tabular-nums">{formatCurrency(row.cy)}</td>
        <td className="w-16 p-1.5">
          <div className="flex items-center gap-1">
            <div
              className="h-2.5 rounded-sm"
              style={{
                width: `${barWidth}%`,
                backgroundColor: barClr,
                minWidth: row.primaryDelta !== 0 ? 3 : 0,
              }}
            />
          </div>
        </td>
        <td className="p-1.5 text-right">{deltaCell(primaryDelta ?? null, primaryPct ?? null, true)}</td>
        <td className="p-1.5 text-right">{deltaCell(secondaryDelta ?? null, secondaryPct ?? null, false)}</td>
        <td className="p-1.5 text-right tabular-nums text-muted-foreground">{row.share.toFixed(0)}%</td>
      </tr>
    );
  };

  const tableHeader = (
    <tr className="border-b border-border bg-muted/30 text-muted-foreground">
      <th className="w-7 p-1.5" />
      <th className="p-1.5 text-left text-xs font-medium">Name</th>
      <th className="p-1.5 text-right text-xs font-medium">CY Avg</th>
      <th className="w-16 p-1.5" />
      <th className="p-1.5 text-right text-xs font-medium">
        {primaryLabel} <span className="text-[10px]">&#9662;</span>
      </th>
      <th className="p-1.5 text-right text-xs font-medium opacity-50">{secondaryLabel}</th>
      <th className="p-1.5 text-right text-xs font-medium">Share</th>
    </tr>
  );

  const renderSummaryRow = (
    label: string,
    cy: number,
    py: number,
    yoyDelta: number,
    popDelta: number | null,
    share: number,
  ) => {
    const yoyPct = py > 0 ? (yoyDelta / py) * 100 : null;
    // PoP pct for subtotal: need prior period subtotal — approximate from delta / (cy - delta)
    const popPrior = popDelta !== null ? cy - popDelta : null;
    const popPct = popPrior !== null && popPrior > 0 ? (popDelta! / popPrior) * 100 : null;

    const primaryD = primaryIsYoY ? yoyDelta : popDelta;
    const primaryP = primaryIsYoY ? yoyPct : popPct;
    const secondaryD = primaryIsYoY ? popDelta : yoyDelta;
    const secondaryP = primaryIsYoY ? popPct : yoyPct;

    return (
      <tr className="border-b border-border bg-muted/20 font-medium">
        <td className="p-1.5" />
        <td className="p-1.5 text-card-foreground">{label}</td>
        <td className="p-1.5 text-right tabular-nums">{formatCurrency(cy)}</td>
        <td className="w-16 p-1.5" />
        <td className="p-1.5 text-right">{deltaCell(primaryD ?? null, primaryP ?? null, true)}</td>
        <td className="p-1.5 text-right">{deltaCell(secondaryD ?? null, secondaryP ?? null, false)}</td>
        <td className="p-1.5 text-right tabular-nums text-muted-foreground">{share.toFixed(0)}%</td>
      </tr>
    );
  };

  const renderPanel = (
    rows: TableRow[],
    panelLabel: string,
    sub: ReturnType<typeof computeSubtotals>,
    isGainPanel: boolean,
    cutCount: number,
    expanded: boolean,
    setExpanded: (v: boolean) => void,
  ) => {
    const bgClass = isGainPanel ? "bg-emerald-950/30" : "bg-red-950/30";
    const labelClass = isGainPanel ? "text-emerald-400" : "text-red-400";

    const visibleRows = expanded || rows.length <= cutCount ? rows : rows.slice(0, cutCount);
    const hiddenCount = rows.length - visibleRows.length;

    return (
      <div className="rounded-md border border-border">
        <div className={`border-b border-border ${bgClass} px-3 py-1.5`}>
          <span className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>
            {panelLabel}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <table className="w-full text-sm">
          <thead>{tableHeader}</thead>
          <tbody>
            {rows.length > 0 ? (
              <>
                {renderSummaryRow("Subtotal", sub.cy, sub.py, sub.yoyDelta, sub.popDelta, sub.share)}
                {visibleRows.map(renderRow)}
                {hiddenCount > 0 && (
                  <tr>
                    <td colSpan={7} className="p-1.5 text-center">
                      <button
                        onClick={() => setExpanded(true)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Show {hiddenCount} more...
                      </button>
                    </td>
                  </tr>
                )}
                {expanded && rows.length > cutCount && (
                  <tr>
                    <td colSpan={7} className="p-1.5 text-center">
                      <button
                        onClick={() => setExpanded(false)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Collapse
                      </button>
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <tr>
                <td colSpan={7} className="p-3 text-center text-muted-foreground">
                  No {panelLabel.toLowerCase()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const totalPrimaryDelta = primaryIsYoY ? totalYoyDelta : totalPopDelta;
  const clrTotal = (totalPrimaryDelta ?? 0) >= 0 ? "#4ade80" : "#f87171";

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {focusedPeriod !== null ? (
            <>
              <strong className="text-foreground">{focusedLabel}</strong> &middot; Click bar again to
              deselect
            </>
          ) : (
            "All periods \u00b7 Click a bar to focus"
          )}
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Total: </span>
          <span className="tabular-nums" style={{ color: clrTotal }}>
            {totalYoyDelta >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(totalYoyDelta))}/day{" "}
            {totalYoyPct !== null && `(${formatPercent(totalYoyPct, true)})`}
          </span>
        </p>
      </div>

      <div className="space-y-3">
        {renderPanel(gainers, "Gainers", gainersSub, true, gainersCutCount, gainersExpanded, setGainersExpanded)}
        {renderPanel(decliners, "Decliners", declinersSub, false, declinersCutCount, declinersExpanded, setDeclinersExpanded)}
      </div>
    </div>
  );
}
