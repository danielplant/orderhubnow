import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textVariants = cva("", {
  variants: {
    variant: {
      // Display - Hero headlines
      "display": "text-5xl md:text-7xl font-medium tracking-tight",
      
      // Headings
      "heading-xl": "text-3xl font-semibold tracking-tight",
      "heading-lg": "text-xl font-semibold tracking-tight",
      "heading-md": "text-lg font-semibold",
      "heading-sm": "text-base font-semibold",
      
      // Body
      "body-lg": "text-base leading-relaxed",
      "body": "text-sm leading-relaxed",
      "body-sm": "text-xs leading-normal",
      
      // UI Text
      "label": "text-xs font-medium uppercase tracking-wider",
      "label-sm": "text-[10px] font-semibold uppercase tracking-widest",
      "caption": "text-[10px] font-medium",
      
      // Specialized
      "mono": "text-xs font-mono",
      "mono-sm": "text-[10px] font-mono",
      "price": "font-bold tabular-nums",
      "price-lg": "text-lg font-bold tabular-nums",
    },
    color: {
      default: "text-foreground",
      secondary: "text-muted-foreground",
      tertiary: "text-muted-foreground/60",
      disabled: "text-muted-foreground/40",
      inverse: "text-primary-foreground",
      ats: "text-ats-text",
      preorder: "text-preorder-text",
      success: "text-success",
      warning: "text-warning",
      error: "text-error",
    },
  },
  defaultVariants: {
    variant: "body",
    color: "default",
  },
});

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "color">,
    VariantProps<typeof textVariants> {
  as?: "p" | "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "label" | "div";
}

export function Text({
  as: Component = "span",
  variant,
  color,
  className,
  ...props
}: TextProps) {
  return (
    <Component
      className={cn(textVariants({ variant, color }), className)}
      {...props}
    />
  );
}

export { textVariants };
