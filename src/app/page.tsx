import { SalesTrendChart } from "@/components/charts/sales-trend-chart";

const API_INTERNAL = `http://localhost:${process.env.API_PORT || 8100}`;

async function prefetchTrend() {
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/sales/trend?granularity=weekly&periods=20&same_store=false`,
      { next: { revalidate: 300 } } // cache 5 min on server
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const initialData = await prefetchTrend();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">Spark Pulse</h1>
        <p className="text-sm text-muted-foreground">PB Group — Retail Dashboard</p>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <SalesTrendChart initialData={initialData} />
      </main>
    </div>
  );
}
