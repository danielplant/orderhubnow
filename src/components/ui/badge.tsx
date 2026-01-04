"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn, focusRing } from "@/lib/utils";

const badgeVariants = cva(
  "rounded-full flex items-center justify-center font-medium transition-colors",
  {
    variants: {
      size: {
        xs: "w-5 h-5 text-[10px]",
        sm: "w-6 h-6 text-xs",
        md: "w-8 h-8 text-xs",
      },
      variant: {
        default: "bg-secondary border border-border text-foreground",
        inverse: "bg-surface-inverse text-text-inverse elevation-sm hover:opacity-90",
        ats: "bg-ats-bg text-ats-text",
        preorder: "bg-preorder-bg text-preorder-text",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof badgeVariants> {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel?: string;
}

export function Badge({
  children,
  size,
  variant,
  className,
  onClick,
  ariaLabel,
  ...props
}: BadgeProps) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        badgeVariants({ size, variant }),
        onClick && ["cursor-pointer", focusRing],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export { badgeVariants };
