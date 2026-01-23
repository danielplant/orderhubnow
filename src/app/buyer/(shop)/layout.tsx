import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { OrderProvider, AnnouncementProvider, CurrencyProvider, ImageConfigProvider } from "@/lib/contexts";
import { BuyerNavWrapper } from "@/components/buyer/buyer-nav-wrapper";
import { buildRepHref } from "@/lib/utils/auth";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Block admin view-as mode from accessing entire buyer flow
  // Redirect back to rep orders page with view-as params preserved
  const headersList = await headers();
  const url = headersList.get("x-url") || "";
  try {
    const parsed = new URL(url, "http://localhost");
    const adminViewAs = parsed.searchParams.get("adminViewAs");
    if (adminViewAs) {
      const repName = parsed.searchParams.get("repName") || undefined;
      redirect(buildRepHref("/rep/orders", { repId: adminViewAs, repName }));
    }
  } catch {
    // URL parsing failed, continue normally
  }

  return (
    <ImageConfigProvider>
      <CurrencyProvider>
        <OrderProvider>
          <AnnouncementProvider>
            <Suspense fallback={<div className="min-h-screen" />}>
              <BuyerNavWrapper>
                {children}
              </BuyerNavWrapper>
            </Suspense>
          </AnnouncementProvider>
        </OrderProvider>
      </CurrencyProvider>
    </ImageConfigProvider>
  );
}
