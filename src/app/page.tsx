import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Spark Pulse
            <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">{process.env.BUILD_HASH}</span>
          </h1>
          <p className="text-sm text-muted-foreground">PB Group — Retail Dashboard</p>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <SalesTrendChart initialData={initialData} />
      </main>
    </div>
  );
}
