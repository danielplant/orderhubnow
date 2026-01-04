import { cn } from "@/lib/utils";

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  strong?: boolean;
  className?: string;
}

export function Divider({
  orientation = "horizontal",
  size = "md",
  strong = false,
  className,
}: DividerProps) {
  const isVertical = orientation === "vertical";

  const sizeClasses = {
    sm: isVertical ? "h-4" : "w-12",
    md: isVertical ? "h-6" : "w-16",
    lg: isVertical ? "h-8" : "w-24",
  };

  return (
    <div
      className={cn(
        isVertical ? "w-px mx-1" : "h-px",
        sizeClasses[size],
        strong ? "bg-border-strong" : "bg-border",
        className
      )}
    />
  );
}
