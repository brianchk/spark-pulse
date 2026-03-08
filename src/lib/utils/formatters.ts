/**
 * Number and date formatting utilities for Spark Pulse.
 * All monetary values are HKD.
 */

export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatCurrencyDecimal(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPercent(value: number, signed = false): string {
  const formatted = `${Math.abs(value).toFixed(1)}%`;
  if (!signed) return formatted;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatChange(value: number): { text: string; direction: "up" | "down" | "flat" } {
  const direction = value > 0.05 ? "up" : value < -0.05 ? "down" : "flat";
  return {
    text: formatPercent(value, true),
    direction,
  };
}
