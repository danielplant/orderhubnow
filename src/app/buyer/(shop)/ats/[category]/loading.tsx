import { ArrowLeft } from "lucide-react";
import { Divider } from "@/components/ui";

export default function Loading() {
  return (
    <div className="bg-background text-foreground">
      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header Skeleton */}
        <div className="mb-8 space-y-4">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Collections
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <div className="h-10 w-48 bg-muted animate-pulse rounded" />
            <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          </div>

          <Divider size="md" strong />
        </div>

        {/* Loading Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border border-border rounded-lg bg-card overflow-hidden">
              {/* Header skeleton */}
              <div className="p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
              </div>

              <div className="border-t border-border" />

              {/* Image skeleton */}
              <div className="aspect-square bg-muted animate-pulse" />

              <div className="border-t border-border" />

              {/* Table skeleton */}
              <div className="p-4">
                <div className="space-y-2">
                  <div className="h-8 bg-muted animate-pulse rounded" />
                  <div className="h-8 bg-muted animate-pulse rounded" />
                  <div className="h-8 bg-muted animate-pulse rounded" />
                  <div className="h-8 bg-muted animate-pulse rounded" />
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Footer skeleton */}
              <div className="flex justify-between items-center px-4 py-3 bg-muted">
                <div className="h-4 w-24 bg-background/50 animate-pulse rounded" />
                <div className="h-4 w-28 bg-background/50 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
