import { Skeleton } from '@/components/ui/skeleton'

export default function RepOrdersLoading() {
  return (
    <div className="p-6 lg:p-10 bg-muted/30">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filter skeletons */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-md border bg-background">
        <div className="border-b p-4">
          <div className="flex gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-24" />
            ))}
          </div>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="border-b p-4 last:border-b-0">
            <div className="flex gap-4">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-24" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
