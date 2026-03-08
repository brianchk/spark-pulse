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

/** MainCat (product category) color palette — distinct from store colors. */
export const MAINCAT_COLORS: Record<string, StoreColor> = {
  TOYS: { solid: "#E6550D", priorYear: "rgba(230,85,13,0.3)" },
  APPAREL: { solid: "#3182BD", priorYear: "rgba(49,130,189,0.3)" },
  KITCHENWARE: { solid: "#31A354", priorYear: "rgba(49,163,84,0.3)" },
  "BABY OTHERS": { solid: "#756BB1", priorYear: "rgba(117,107,177,0.3)" },
  FURNITURE: { solid: "#843C39", priorYear: "rgba(132,60,57,0.3)" },
  "BEDDING & LINEN": { solid: "#E7969C", priorYear: "rgba(231,150,156,0.3)" },
  "HOME DECOR": { solid: "#D6616B", priorYear: "rgba(214,97,107,0.3)" },
  "PERSONAL CARE & BEAUTY": { solid: "#7B4173", priorYear: "rgba(123,65,115,0.3)" },
  "BOOKS - STATIONERY - ARTS & CRAFT": { solid: "#CE6DBD", priorYear: "rgba(206,109,189,0.3)" },
  "SPECIAL CODE": { solid: "#636363", priorYear: "rgba(99,99,99,0.3)" },
  "OUTDOOR - SPORTS - TRAVEL": { solid: "#17BECF", priorYear: "rgba(23,190,207,0.3)" },
  "FOOD & BEVERAGE": { solid: "#BCBD22", priorYear: "rgba(188,189,34,0.3)" },
  PARTY: { solid: "#E377C2", priorYear: "rgba(227,119,194,0.3)" },
  JEWELLERY: { solid: "#8C6D31", priorYear: "rgba(140,109,49,0.3)" },
  Other: { solid: "#969696", priorYear: "rgba(150,150,150,0.3)" },
};

/** Get category color, falling back to gray if unknown. */
export function getMaincatColor(name: string): StoreColor {
  return MAINCAT_COLORS[name] ?? { solid: "#888888", priorYear: "rgba(136,136,136,0.3)" };
}
