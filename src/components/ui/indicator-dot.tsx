import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const indicatorDotVariants = cva("rounded-full", {
  variants: {
    size: {
      sm: "h-2 w-2",
      md: "h-3 w-3",
    },
    status: {
      success: "bg-success",
      warning: "bg-warning",
      error: "bg-error",
      info: "bg-info",
      ats: "bg-ats",
      preorder: "bg-preorder",
      neutral: "bg-muted-foreground",
    },
    pulse: {
      true: "animate-pulse",
      false: "",
    },
  },
  defaultVariants: {
    size: "sm",
    status: "success",
    pulse: false,
  },
});

export interface IndicatorDotProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof indicatorDotVariants> {}

export function IndicatorDot({
  size,
  status,
  pulse,
  className,
  ...props
}: IndicatorDotProps) {
  return (
    <div
      className={cn(indicatorDotVariants({ size, status, pulse }), className)}
      role="status"
      aria-label={`Status: ${status}`}
      {...props}
    />
  );
}

export { indicatorDotVariants };
