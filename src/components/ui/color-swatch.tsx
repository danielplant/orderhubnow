import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { getColorHex } from "@/lib/constants/colors";

const colorSwatchVariants = cva(
  "rounded-full ring-1 ring-border elevation-sm",
  {
    variants: {
      size: {
        sm: "w-4 h-4",
        md: "w-5 h-5",
        lg: "w-6 h-6",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

export interface ColorSwatchProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof colorSwatchVariants> {
  color: string;
}

export function ColorSwatch({
  color,
  size,
  className,
  ...props
}: ColorSwatchProps) {
  return (
    <div
      className={cn(colorSwatchVariants({ size }), className)}
      style={{ background: getColorHex(color) }}
      title={color}
      role="img"
      aria-label={`Color: ${color}`}
      {...props}
    />
  );
}

export { colorSwatchVariants };
