"use client";

import { ArrowRight, Zap, CalendarClock } from "lucide-react";
import type { CategoryMetric } from "@/lib/types";
import { cn } from "@/lib/utils";
import { IndicatorDot, IconBox } from "@/components/ui";
import { CategoryMetricsPanel } from "./category-metrics-panel";

interface JourneyCardProps {
  mode: "ATS" | "PRE_ORDER";
  title: string;
  description: string;
  metrics: CategoryMetric[];
  lastUpdated?: string;
  onClick?: () => void;
}

export function JourneyCard({ mode, title, description, metrics, lastUpdated, onClick }: JourneyCardProps) {
  const isATS = mode === "ATS";

  return (
    <button
      onClick={onClick}
      type="submit"
      aria-label={`${title} - ${isATS ? "Live Inventory" : "Seasonal Planning"}`}
      className={cn(
        "group relative flex flex-col items-start text-left w-full overflow-hidden rounded-lg border border-border bg-card",
        "transition-all motion-normal",
        "hover:border-muted-foreground/30 hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      {/* Header Section */}
      <div className="w-full p-6 pb-4 flex items-start justify-between border-b border-border/40">
        <div className="flex items-center gap-4">
          <IconBox
            size="lg"
            variant="outline"
            className={cn(
              "transition-colors motion-fast",
              isATS
                ? "border-ats/20 bg-ats-bg text-ats-text group-hover:border-ats/40"
                : "border-preorder/20 bg-preorder-bg text-preorder-text group-hover:border-preorder/40"
            )}
          >
            {isATS ? <Zap className="h-6 w-6" /> : <CalendarClock className="h-6 w-6" />}
          </IconBox>
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-foreground group-hover:text-primary flex items-center gap-2">
              {title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <IndicatorDot
                status={isATS ? "ats" : "preorder"}
                pulse={isATS}
              />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isATS ? "Live Inventory" : "Seasonal Planning"}
              </span>
            </div>
          </div>
        </div>
        
        <div className={cn(
          "opacity-0 -translate-x-2 transition-all motion-normal group-hover:opacity-100 group-hover:translate-x-0",
          isATS ? "text-ats" : "text-preorder"
        )}>
          <ArrowRight className="h-5 w-5" />
        </div>
      </div>

      {/* Description */}
      <div className="w-full px-6 py-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      {/* Data Density Section */}
      <div className="w-full px-6 pb-6 mt-auto">
        <CategoryMetricsPanel metrics={metrics} lastUpdated={lastUpdated} />
      </div>
    </button>
  );
}
