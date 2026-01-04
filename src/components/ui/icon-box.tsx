import { cn } from "@/lib/utils";

interface IconBoxProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "outline";
  className?: string;
}

export function IconBox({
  children,
  size = "md",
  variant = "primary",
  className,
}: IconBoxProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const variantClasses = {
    primary: "bg-primary text-primary-foreground shadow-sm",
    outline: "border bg-transparent",
  };

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {children}
    </div>
  );
}
