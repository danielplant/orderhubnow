import { JourneyCard } from "@/components/buyer/journey-card";
import { BrandHeader } from "@/components/buyer/brand-header";
import { CurrencyToggle } from "@/components/buyer/currency-toggle";
import { getInventoryMetrics } from "@/lib/data/queries/inventory";
import { redirect } from "next/navigation";

export default async function SelectJourneyPage() {
  const metrics = await getInventoryMetrics();

  async function navigateToAts() {
    "use server";
    redirect("/buyer/ats");
  }

  async function navigateToPreOrder() {
    "use server";
    redirect("/buyer/pre-order");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BrandHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-6xl space-y-10">
          
          {/* Hero Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Order Entry Portal
              </h1>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Currency:</span>
                <CurrencyToggle size="lg" />
              </div>
            </div>
            <p className="text-base text-muted-foreground max-w-3xl">
              Select your inventory channel. Access real-time stock availability for immediate fulfillment or book future seasonal allocations.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid md:grid-cols-2 gap-6 w-full">
            <form action={navigateToAts} className="w-full">
              <JourneyCard
                mode="ATS"
                title="Immediate Delivery (ATS)"
                description="Access current warehouse inventory available for immediate shipment. Real-time stock levels across all active lines."
                metrics={metrics.ats.categories}
                lastUpdated={metrics.lastUpdated}
              />
            </form>

            <form action={navigateToPreOrder} className="w-full">
              <JourneyCard
                mode="PRE_ORDER"
                title="Future Seasons (Pre-Order)"
                description="Book inventory for upcoming seasonal deliveries. Review line sheets and secure allocations for future ship windows."
                metrics={metrics.preOrder.categories}
                lastUpdated={metrics.lastUpdated}
              />
            </form>
          </div>
          
        </div>
      </main>
    </div>
  );
}
