/**
 * Spark Pulse — Core type definitions.
 * TypeScript strict mode = these types ARE the spec.
 */

// === Chart Component Contract ===

export interface ChartComponentProps {
  data: Record<string, unknown>[];
  height?: number;
  loading?: boolean;
  error?: Error;
  title?: string;
  subtitle?: string;
  onElementClick?: (params: unknown) => void;
  animationMode?: "standard" | "entrance" | "none";
}

// === KPI ===

export interface KPIData {
  label: string;
  value: number;
  formattedValue: string;
  change: number; // percentage change vs comparison period
  changeLabel: string; // "vs LM", "vs LY"
  trend?: number[]; // sparkline data
}

// === Filters ===

export interface DashboardFilters {
  dateRange: {
    start: string; // ISO date
    end: string;
  };
  stores: string[]; // store codes: QRC, HC, PP, etc.
  brands: string[]; // brand codes: JELL, ATEL, etc.
  comparison: "wow" | "mom" | "yoy";
}

// === Store ===

export interface Store {
  code: string; // QRC, HC, PP, K11, GLOW, LG2, MG, RB, QRE
  name: string;
  color: string; // hex color for charts
}

// === Sales ===

export interface SalesSummary {
  storeCode: string;
  revenue: number;
  transactions: number;
  units: number;
  atv: number; // average transaction value
  upt: number; // units per transaction
  asp: number; // average selling price
}

export interface DailySales {
  date: string; // ISO date
  storeCode: string;
  revenue: number;
  transactions: number;
}
