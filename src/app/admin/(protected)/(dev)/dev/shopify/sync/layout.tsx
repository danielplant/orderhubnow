export default function SyncServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 bg-muted/30">
      {children}
    </div>
  );
}
