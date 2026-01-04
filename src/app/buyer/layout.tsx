import { OrderProvider, AnnouncementProvider, CurrencyProvider } from "@/lib/contexts";

export default function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CurrencyProvider>
      <OrderProvider>
        <AnnouncementProvider>
          {children}
        </AnnouncementProvider>
      </OrderProvider>
    </CurrencyProvider>
  );
}
