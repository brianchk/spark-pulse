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
  const { rows, totalCy, totalPy } = useMemo(() => {
    const result: TableRow[] = [];
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

      result.push({
        name: g,
        cy,
        py,
        delta: cy - py,
        deltaPct: py > 0 ? ((cy - py) / py) * 100 : cy > 0 ? 100 : null,
        share: 0,
        color: getColor(g).solid,
      });
    }

    const tCy = result.reduce((s, r) => s + Math.max(r.cy, 0), 0);
    const tPy = result.reduce((s, r) => s + Math.max(r.py, 0), 0);
    for (const r of result) {
      r.share = tCy > 0 ? (Math.max(r.cy, 0) / tCy) * 100 : 0;
    }

    result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { rows: result, totalCy: tCy, totalPy: tPy };
  }, [data, groups, getColor, focusedPeriod]);

  const totalDelta = totalCy - totalPy;
  const totalDeltaPct = totalPy > 0 ? (totalDelta / totalPy) * 100 : null;
  const clr = (d: number) => (d >= 0 ? "#4ade80" : "#f87171");

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
        <p className="text-xs text-muted-foreground">Sorted by biggest movers</p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground">
              <th className="w-8 p-2" />
              <th className="p-2 text-left font-medium">Name</th>
              <th className="p-2 text-right font-medium">CY Avg/Day</th>
              <th className="p-2 text-right font-medium">PY Avg/Day</th>
              <th className="p-2 text-right font-medium">&Delta; $/Day</th>
              <th className="p-2 text-right font-medium">YoY %</th>
              <th className="p-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className="border-b border-border/40 transition-colors hover:bg-muted/40"
                onMouseEnter={() => onGroupHover(row.name)}
                onMouseLeave={() => onGroupHover(null)}
              >
                <td className="p-2 text-center">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: row.color }}
                  />
                </td>
                <td className="p-2 font-medium text-card-foreground">{row.name}</td>
                <td className="p-2 text-right tabular-nums">{formatCurrency(row.cy)}</td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(row.py)}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: clr(row.delta) }}>
                  {row.delta >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(row.delta))}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: clr(row.delta) }}>
                  {row.deltaPct !== null ? formatPercent(row.deltaPct, true) : "\u2014"}
                </td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {row.share.toFixed(1)}%
                </td>
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/20 font-medium">
              <td className="p-2" />
              <td className="p-2 text-card-foreground">Total</td>
              <td className="p-2 text-right tabular-nums">{formatCurrency(totalCy)}</td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {formatCurrency(totalPy)}
              </td>
              <td className="p-2 text-right tabular-nums" style={{ color: clr(totalDelta) }}>
                {totalDelta >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(totalDelta))}
              </td>
              <td className="p-2 text-right tabular-nums" style={{ color: clr(totalDelta) }}>
                {totalDeltaPct !== null ? formatPercent(totalDeltaPct, true) : "\u2014"}
              </td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
