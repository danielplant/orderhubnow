import { BarChart3, Clock } from "lucide-react";
import type { CategoryMetric } from "@/lib/types";
import { Text } from "@/components/ui";

interface CategoryMetricsPanelProps {
  metrics: CategoryMetric[];
  lastUpdated?: string;
}

export function CategoryMetricsPanel({ metrics, lastUpdated }: CategoryMetricsPanelProps) {
  return (
    <div className="bg-secondary/50 rounded-lg p-4 border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Full Category List ({metrics.length})
        </span>
        {lastUpdated && (
          <Text variant="caption" color="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Updated {lastUpdated}
          </Text>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border">
        {metrics.map((metric) => (
          <div
            key={metric.name}
            className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0"
          >
            <span
              className="text-muted-foreground truncate pr-2 text-xs"
              title={metric.name}
            >
              {metric.name}
            </span>
            <span className="font-mono font-medium text-foreground whitespace-nowrap text-xs">
              {metric.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
