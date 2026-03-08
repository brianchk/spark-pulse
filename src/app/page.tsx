"use client";

import { SalesTrendChart } from "@/components/charts/sales-trend-chart";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">Spark Pulse</h1>
        <p className="text-sm text-muted-foreground">PB Group — Retail Dashboard</p>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <SalesTrendChart />
      </main>
    </div>
  );
}
