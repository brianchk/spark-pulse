"use client";

import { useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils/formatters";
import type { StoreColor } from "@/lib/constants/store-colors";

interface TableRow {
  name: string;
  cy: number;
  py: number;
  delta: number;
  deltaPct: number | null;
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
  onGroupHover: (group: string | null) => void;
}

export function TrendDetailTable({
  data,
  groups,
  getColor,
  focusedPeriod,
  focusedLabel,
  onGroupHover,
}: TrendDetailTableProps) {
  const { gainers, decliners, totalCy, totalPy } = useMemo(() => {
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

      all.push({
        name: g,
        cy,
        py,
        delta: cy - py,
        deltaPct: py > 0 ? ((cy - py) / py) * 100 : cy > 0 ? 100 : null,
        share: 0,
        color: getColor(g).solid,
      });
    }

    const tCy = all.reduce((s, r) => s + Math.max(r.cy, 0), 0);
    const tPy = all.reduce((s, r) => s + Math.max(r.py, 0), 0);
    for (const r of all) {
      r.share = tCy > 0 ? (Math.max(r.cy, 0) / tCy) * 100 : 0;
    }

    // Split into gainers (delta >= 0, sorted biggest first) and decliners (delta < 0, sorted biggest drop first)
    const g = all.filter((r) => r.delta >= 0).sort((a, b) => b.delta - a.delta);
    const d = all.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);

    return { gainers: g, decliners: d, totalCy: tCy, totalPy: tPy };
  }, [data, groups, getColor, focusedPeriod]);

  const totalDelta = totalCy - totalPy;
  const totalDeltaPct = totalPy > 0 ? (totalDelta / totalPy) * 100 : null;
  const maxAbsDelta = Math.max(...[...gainers, ...decliners].map((r) => Math.abs(r.delta)), 1);

  const renderRow = (row: TableRow) => {
    const barWidth = Math.min((Math.abs(row.delta) / maxAbsDelta) * 100, 100);
    const isGain = row.delta >= 0;
    const clr = isGain ? "#4ade80" : "#f87171";

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
        <td className="w-20 p-1.5">
          <div className="flex items-center gap-1">
            <div
              className="h-2.5 rounded-sm"
              style={{
                width: `${barWidth}%`,
                backgroundColor: clr,
                minWidth: row.delta !== 0 ? 3 : 0,
              }}
            />
          </div>
        </td>
        <td className="p-1.5 text-right tabular-nums" style={{ color: clr }}>
          {isGain ? "+" : "-"}
          {formatCurrency(Math.abs(row.delta))}
        </td>
        <td className="p-1.5 text-right tabular-nums" style={{ color: clr }}>
          {row.deltaPct !== null ? formatPercent(row.deltaPct, true) : "\u2014"}
        </td>
        <td className="p-1.5 text-right tabular-nums text-muted-foreground">{row.share.toFixed(0)}%</td>
      </tr>
    );
  };

  const tableHeader = (
    <tr className="border-b border-border bg-muted/30 text-muted-foreground">
      <th className="w-7 p-1.5" />
      <th className="p-1.5 text-left text-xs font-medium">Name</th>
      <th className="p-1.5 text-right text-xs font-medium">CY Avg</th>
      <th className="w-20 p-1.5" />
      <th className="p-1.5 text-right text-xs font-medium">&Delta;/Day</th>
      <th className="p-1.5 text-right text-xs font-medium">YoY</th>
      <th className="p-1.5 text-right text-xs font-medium">Share</th>
    </tr>
  );

  const clrTotal = totalDelta >= 0 ? "#4ade80" : "#f87171";

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
            {totalDelta >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(totalDelta))}/day{" "}
            {totalDeltaPct !== null && `(${formatPercent(totalDeltaPct, true)})`}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Gainers */}
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-emerald-950/30 px-3 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Gainers
            </span>
            <span className="ml-2 text-xs text-muted-foreground">({gainers.length})</span>
          </div>
          <table className="w-full text-sm">
            <thead>{tableHeader}</thead>
            <tbody>
              {gainers.length > 0 ? (
                gainers.map(renderRow)
              ) : (
                <tr>
                  <td colSpan={7} className="p-3 text-center text-muted-foreground">
                    No gainers
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Decliners */}
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-red-950/30 px-3 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-red-400">
              Decliners
            </span>
            <span className="ml-2 text-xs text-muted-foreground">({decliners.length})</span>
          </div>
          <table className="w-full text-sm">
            <thead>{tableHeader}</thead>
            <tbody>
              {decliners.length > 0 ? (
                decliners.map(renderRow)
              ) : (
                <tr>
                  <td colSpan={7} className="p-3 text-center text-muted-foreground">
                    No decliners
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
