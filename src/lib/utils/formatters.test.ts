import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyDecimal, formatCount, formatPercent, formatChange } from "./formatters";

describe("formatCurrency", () => {
  it("formats large numbers with commas", () => {
    expect(formatCurrency(6680123)).toBe("$6,680,123");
  });

  it("compact: millions", () => {
    expect(formatCurrency(6680123, true)).toBe("$6.68M");
  });

  it("compact: thousands", () => {
    expect(formatCurrency(956234, true)).toBe("$956K");
  });
});

describe("formatCurrencyDecimal", () => {
  it("formats ATV-scale numbers with 2 decimals", () => {
    expect(formatCurrencyDecimal(731.19)).toBe("$731.19");
  });
});

describe("formatCount", () => {
  it("formats with commas, no decimals", () => {
    expect(formatCount(9136)).toBe("9,136");
  });
});

describe("formatPercent", () => {
  it("unsigned", () => {
    expect(formatPercent(12.3)).toBe("12.3%");
  });

  it("signed positive", () => {
    expect(formatPercent(12.3, true)).toBe("+12.3%");
  });

  it("signed negative", () => {
    expect(formatPercent(-5.2, true)).toBe("-5.2%");
  });
});

describe("formatChange", () => {
  it("positive change", () => {
    const result = formatChange(12.3);
    expect(result.direction).toBe("up");
    expect(result.text).toBe("+12.3%");
  });

  it("negative change", () => {
    const result = formatChange(-5.2);
    expect(result.direction).toBe("down");
  });

  it("flat change", () => {
    const result = formatChange(0.01);
    expect(result.direction).toBe("flat");
  });
});
