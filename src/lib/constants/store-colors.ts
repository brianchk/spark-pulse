/**
 * Official PB store color palette.
 * Extracted from shop-summary.xlsm (Reports/Buying on SharePoint).
 * Prior-year uses the same color at 30% opacity (matching the Excel "shadow bar" pattern).
 */

export interface StoreColor {
  solid: string;
  priorYear: string; // 30% alpha for YoY comparison bars
}

export const STORE_COLORS: Record<string, StoreColor> = {
  QRC: { solid: "#548135", priorYear: "rgba(84,129,53,0.3)" },
  QRE: { solid: "#335593", priorYear: "rgba(51,85,147,0.3)" },
  PP: { solid: "#8E98A5", priorYear: "rgba(142,152,165,0.3)" },
  K11: { solid: "#B15D24", priorYear: "rgba(177,93,36,0.3)" },
  LG2: { solid: "#7030A0", priorYear: "rgba(112,48,160,0.3)" },
  RB: { solid: "#BF9000", priorYear: "rgba(191,144,0,0.3)" },
  HC: { solid: "#5B9BD5", priorYear: "rgba(91,155,213,0.3)" },
  GLOW: { solid: "#F4B183", priorYear: "rgba(244,177,131,0.3)" },
  MG: { solid: "#A9CD90", priorYear: "rgba(169,205,144,0.3)" },
  // Online / Wholesale (not in Excel chart — using neutral colors)
  Shopify: { solid: "#96BF48", priorYear: "rgba(150,191,72,0.3)" },
  HKTV: { solid: "#E44D26", priorYear: "rgba(228,77,38,0.3)" },
  Wholesale: { solid: "#666666", priorYear: "rgba(102,102,102,0.3)" },
};

/** Ordered list of retail stores (matches chart stacking order from Excel — bottom to top). */
export const RETAIL_STORE_ORDER = ["QRC", "QRE", "PP", "K11", "LG2", "RB", "HC", "GLOW", "MG"];

/** Get store color, falling back to gray if unknown. */
export function getStoreColor(name: string): StoreColor {
  return STORE_COLORS[name] ?? { solid: "#888888", priorYear: "rgba(136,136,136,0.3)" };
}
