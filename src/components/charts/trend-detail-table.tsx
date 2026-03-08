"use client";

import { Fragment, useState, useMemo, useCallback } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils/formatters";
import type { StoreColor } from "@/lib/constants/store-colors";

const MIN_VISIBLE = 3;
const MOVER_THRESHOLD = 0.8;

const POP_LABELS: Record<string, string> = {
  daily: "DoD",
  weekly: "WoW",
  monthly: "MoM",
};

type SortKey = "name" | "cy" | "yoyDelta" | "yoyPct" | "popDelta" | "popPct" | "share";

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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const primaryIsYoY = granularity !== "monthly";
  const popLabel = POP_LABELS[granularity] || "PoP";

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return key;
      }
      setSortAsc(false);
      return key;
    });
  }, []);

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

      all.push({ name: g, cy, py, yoyDelta, yoyPct, popDelta, popPct, primaryDelta, share: 0, color: getColor(g).solid });
    }

    const tCy = all.reduce((s, r) => s + Math.max(r.cy, 0), 0);
    const tPy = all.reduce((s, r) => s + Math.max(r.py, 0), 0);
    for (const r of all) {
      r.share = tCy > 0 ? (Math.max(r.cy, 0) / tCy) * 100 : 0;
    }

    const sortRows = (rows: TableRow[]) => {
      if (!sortKey) return rows;
      return [...rows].sort((a, b) => {
        const va = a[sortKey] ?? -Infinity;
        const vb = b[sortKey] ?? -Infinity;
        if (typeof va === "string" && typeof vb === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    };

    const gRaw = all.filter((r) => r.primaryDelta >= 0).sort((a, b) => b.primaryDelta - a.primaryDelta);
    const dRaw = all.filter((r) => r.primaryDelta < 0).sort((a, b) => a.primaryDelta - b.primaryDelta);

    const combined = [...gRaw, ...dRaw];
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

    const gCut = Math.max(gRaw.filter((r) => significantNames.has(r.name)).length, MIN_VISIBLE);
    const dCut = Math.max(dRaw.filter((r) => significantNames.has(r.name)).length, MIN_VISIBLE);

    const tYoyDelta = tCy - tPy;
    const refIdx2 = focusedPeriod ?? data.labels.length - 1;
    const prevIdx2 = refIdx2 - 1;
    let tPopDelta: number | null = null;
    if (prevIdx2 >= 0 && refIdx2 < data.labels.length) {
      const refTotal = groups.reduce((s, grp) => s + ((data.cy[grp] || [])[refIdx2] || 0), 0);
      const prevTotal = groups.reduce((s, grp) => s + ((data.cy[grp] || [])[prevIdx2] || 0), 0);
      tPopDelta = refTotal - prevTotal;
    }

    return {
      gainers: sortRows(gRaw), decliners: sortRows(dRaw), totalPy: tPy,
      totalYoyDelta: tYoyDelta, totalPopDelta: tPopDelta,
      gainersCutCount: gCut, declinersCutCount: dCut,
    };
  }, [data, groups, getColor, focusedPeriod, primaryIsYoY, sortKey, sortAsc]);

  const totalYoyPct = totalPy > 0 ? (totalYoyDelta / totalPy) * 100 : null;
  const maxAbsDelta = Math.max(...[...gainers, ...decliners].map((r) => Math.abs(r.primaryDelta)), 1);

  const computeSubtotals = (rows: TableRow[]) => ({
    cy: rows.reduce((s, r) => s + r.cy, 0),
    py: rows.reduce((s, r) => s + r.py, 0),
    yoyDelta: rows.reduce((s, r) => s + r.yoyDelta, 0),
    yoyPct: (() => {
      const py = rows.reduce((s, r) => s + r.py, 0);
      const delta = rows.reduce((s, r) => s + r.yoyDelta, 0);
      return py > 0 ? (delta / py) * 100 : null;
    })(),
    popDelta: rows.some((r) => r.popDelta !== null) ? rows.reduce((s, r) => s + (r.popDelta ?? 0), 0) : null,
    popPct: (() => {
      if (!rows.some((r) => r.popDelta !== null)) return null;
      const cy = rows.reduce((s, r) => s + r.cy, 0);
      const popD = rows.reduce((s, r) => s + (r.popDelta ?? 0), 0);
      const prior = cy - popD;
      return prior > 0 ? (popD / prior) * 100 : null;
    })(),
    share: rows.reduce((s, r) => s + r.share, 0),
  });

  const gainersSub = computeSubtotals(gainers);
  const declinersSub = computeSubtotals(decliners);

  const deltaVal = (delta: number | null) => {
    if (delta === null) return <span className="text-muted-foreground">{"\u2014"}</span>;
    const isGain = delta >= 0;
    const clr = isGain ? "var(--color-gain)" : "var(--color-loss)";
    return (
      <span className="tabular-nums" style={{ color: clr }}>
        {isGain ? "+" : "-"}{formatCurrency(Math.abs(delta))}
      </span>
    );
  };

  const pctVal = (pct: number | null) => {
    if (pct === null) return <span className="text-muted-foreground">{"\u2014"}</span>;
    const clr = pct >= 0 ? "var(--color-gain)" : "var(--color-loss)";
    return <span className="tabular-nums" style={{ color: clr }}>{formatPercent(pct, true)}</span>;
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-0.5 text-[10px]">{sortAsc ? "\u25b4" : "\u25be"}</span>;
  };

  const defaultSortMark = (key: SortKey) => {
    if (sortKey !== null) return null;
    const isPrimaryDelta = (primaryIsYoY && key === "yoyDelta") || (!primaryIsYoY && key === "popDelta");
    if (!isPrimaryDelta) return null;
    return <span className="ml-0.5 text-[10px]">{"\u25be"}</span>;
  };

  const thSort = "p-1.5 text-right text-xs font-medium cursor-pointer select-none hover:text-foreground transition-colors";
  // Columns hidden on narrow, shown on desktop — bar and % columns
  const thDesktopOnly = `${thSort} hidden lg:table-cell`;

  const primaryDeltaKey: SortKey = primaryIsYoY ? "yoyDelta" : "popDelta";
  const primaryPctKey: SortKey = primaryIsYoY ? "yoyPct" : "popPct";
  const secondaryDeltaKey: SortKey = primaryIsYoY ? "popDelta" : "yoyDelta";
  const secondaryPctKey: SortKey = primaryIsYoY ? "popPct" : "yoyPct";
  const primaryLabel = primaryIsYoY ? "YoY" : popLabel;
  const secondaryLabel = primaryIsYoY ? popLabel : "YoY";

  // Desktop: 9 cols (color, name, cy, bar, prim$, prim%, sec$, sec%, share)
  // Narrow:  6 cols (color, name, cy, prim$, sec$, share) — bar/prim%/sec% hidden
  const COL_SPAN_ALL = 9;

  const tableHeader = (
    <tr className="border-b border-border bg-muted/30 text-muted-foreground">
      <th className="w-7 p-1.5" />
      <th className="p-1.5 text-left text-xs font-medium cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("name")}>
        Name{sortIndicator("name")}
      </th>
      <th className={thSort} onClick={() => handleSort("cy")}>CY Avg{sortIndicator("cy")}</th>
      <th className="w-14 p-1.5 hidden lg:table-cell" />
      <th className={thSort} onClick={() => handleSort(primaryDeltaKey)}>
        {primaryLabel} ${sortIndicator(primaryDeltaKey)}{defaultSortMark(primaryDeltaKey)}
      </th>
      <th className={thDesktopOnly} onClick={() => handleSort(primaryPctKey)}>
        {primaryLabel} %{sortIndicator(primaryPctKey)}
      </th>
      <th className={`${thSort} opacity-50`} onClick={() => handleSort(secondaryDeltaKey)}>
        {secondaryLabel} ${sortIndicator(secondaryDeltaKey)}
      </th>
      <th className={`${thDesktopOnly} opacity-50`} onClick={() => handleSort(secondaryPctKey)}>
        {secondaryLabel} %{sortIndicator(secondaryPctKey)}
      </th>
      <th className={thSort} onClick={() => handleSort("share")}>Share{sortIndicator("share")}</th>
    </tr>
  );

  const renderRow = (row: TableRow) => {
    const barWidth = Math.min((Math.abs(row.primaryDelta) / maxAbsDelta) * 100, 100);
    const isGain = row.primaryDelta >= 0;
    const barClr = isGain ? "var(--color-gain)" : "var(--color-loss)";

    const pDelta = primaryIsYoY ? row.yoyDelta : row.popDelta;
    const pPct = primaryIsYoY ? row.yoyPct : row.popPct;
    const sDelta = primaryIsYoY ? row.popDelta : row.yoyDelta;
    const sPct = primaryIsYoY ? row.popPct : row.yoyPct;

    return (
      <Fragment key={row.name}>
        {/* Row 1: always visible — data row */}
        <tr
          className="border-b border-border/40 lg:border-b transition-colors hover:bg-muted/40 group"
          onMouseEnter={() => onGroupHover(row.name)}
          onMouseLeave={() => onGroupHover(null)}
        >
          <td className="p-1.5 text-center">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: row.color }} />
          </td>
          <td className="p-1.5 font-medium text-card-foreground">{row.name}</td>
          <td className="p-1.5 text-right tabular-nums">{formatCurrency(row.cy)}</td>
          <td className="w-14 p-1.5 hidden lg:table-cell">
            <div
              className="h-2.5 rounded-sm"
              style={{ width: `${barWidth}%`, backgroundColor: barClr, minWidth: row.primaryDelta !== 0 ? 3 : 0 }}
            />
          </td>
          <td className="p-1.5 text-right">{deltaVal(pDelta)}</td>
          <td className="p-1.5 text-right hidden lg:table-cell">{pctVal(pPct)}</td>
          <td className="p-1.5 text-right opacity-50">{deltaVal(sDelta)}</td>
          <td className="p-1.5 text-right hidden lg:table-cell opacity-50">{pctVal(sPct)}</td>
          <td className="p-1.5 text-right tabular-nums text-muted-foreground">{row.share.toFixed(0)}%</td>
        </tr>
        {/* Row 2: narrow only — context (bar, primary %, secondary %) */}
        <tr
          className="border-b border-border/40 lg:hidden group-hover:bg-muted/40"
          onMouseEnter={() => onGroupHover(row.name)}
          onMouseLeave={() => onGroupHover(null)}
        >
          <td colSpan={2} className="pb-1.5 px-1.5" />
          <td className="pb-1.5 px-1.5">
            <div
              className="h-2 rounded-sm"
              style={{ width: `${barWidth}%`, backgroundColor: barClr, minWidth: row.primaryDelta !== 0 ? 3 : 0 }}
            />
          </td>
          <td className="pb-1.5 px-1.5 text-right text-xs text-muted-foreground">{pctVal(pPct)}</td>
          <td className="pb-1.5 px-1.5 text-right text-xs text-muted-foreground opacity-50">{pctVal(sPct)}</td>
          <td className="pb-1.5 px-1.5" />
        </tr>
      </Fragment>
    );
  };

  const renderSummaryRow = (label: string, sub: ReturnType<typeof computeSubtotals>) => {
    const pDelta = primaryIsYoY ? sub.yoyDelta : sub.popDelta;
    const pPct = primaryIsYoY ? sub.yoyPct : sub.popPct;
    const sDelta = primaryIsYoY ? sub.popDelta : sub.yoyDelta;
    const sPct = primaryIsYoY ? sub.popPct : sub.yoyPct;

    return (
      <Fragment key={`summary-${label}`}>
        <tr className="border-b border-border bg-muted/50 dark:bg-muted/30 font-medium">
          <td className="p-1.5" />
          <td className="p-1.5 text-card-foreground">{label}</td>
          <td className="p-1.5 text-right tabular-nums">{formatCurrency(sub.cy)}</td>
          <td className="w-14 p-1.5 hidden lg:table-cell" />
          <td className="p-1.5 text-right">{deltaVal(pDelta)}</td>
          <td className="p-1.5 text-right hidden lg:table-cell">{pctVal(pPct)}</td>
          <td className="p-1.5 text-right opacity-50">{deltaVal(sDelta)}</td>
          <td className="p-1.5 text-right hidden lg:table-cell opacity-50">{pctVal(sPct)}</td>
          <td className="p-1.5 text-right tabular-nums text-muted-foreground">{sub.share.toFixed(0)}%</td>
        </tr>
        {/* Summary context row — narrow only */}
        <tr className="border-b border-border bg-muted/50 dark:bg-muted/30 font-medium lg:hidden">
          <td colSpan={2} className="pb-1.5 px-1.5" />
          <td className="pb-1.5 px-1.5" />
          <td className="pb-1.5 px-1.5 text-right text-xs text-muted-foreground">{pctVal(pPct)}</td>
          <td className="pb-1.5 px-1.5 text-right text-xs text-muted-foreground opacity-50">{pctVal(sPct)}</td>
          <td className="pb-1.5 px-1.5" />
        </tr>
      </Fragment>
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
    const bgClass = isGainPanel ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30";
    const labelClass = isGainPanel ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
    const visibleRows = expanded || rows.length <= cutCount ? rows : rows.slice(0, cutCount);
    const hiddenCount = rows.length - visibleRows.length;

    return (
      <div className="rounded-md border border-border">
        <div className={`border-b border-border ${bgClass} px-3 py-1.5`}>
          <span className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>{panelLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <table className="w-full text-sm">
          <thead>{tableHeader}</thead>
          <tbody>
            {rows.length > 0 ? (
              <>
                {renderSummaryRow("Subtotal", sub)}
                {visibleRows.map(renderRow)}
                {hiddenCount > 0 && (
                  <tr>
                    <td colSpan={COL_SPAN_ALL} className="p-1.5 text-center">
                      <button onClick={() => setExpanded(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Show {hiddenCount} more...
                      </button>
                    </td>
                  </tr>
                )}
                {expanded && rows.length > cutCount && (
                  <tr>
                    <td colSpan={COL_SPAN_ALL} className="p-1.5 text-center">
                      <button onClick={() => setExpanded(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Collapse
                      </button>
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <tr>
                <td colSpan={COL_SPAN_ALL} className="p-3 text-center text-muted-foreground">No {panelLabel.toLowerCase()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const totalPrimaryDelta = primaryIsYoY ? totalYoyDelta : totalPopDelta;
  const clrTotal = (totalPrimaryDelta ?? 0) >= 0 ? "var(--color-gain)" : "var(--color-loss)";

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {focusedPeriod !== null ? (
            <>
              <strong className="text-foreground">{focusedLabel}</strong> &middot; Click bar again to deselect
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
