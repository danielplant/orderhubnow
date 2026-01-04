"use client";

import { useCurrency } from "@/lib/contexts";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/types";

interface CurrencyToggleProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const FLAG_EMOJI: Record<Currency, string> = {
  CAD: "🇨🇦",
  USD: "🇺🇸",
};

export function CurrencyToggle({ size = "md", className }: CurrencyToggleProps) {
  const { currency, setCurrency } = useCurrency();

  const sizeClasses = {
    sm: "text-xs gap-0.5 px-1 py-0.5",
    md: "text-sm gap-1 px-2 py-1",
    lg: "text-base gap-1.5 px-3 py-1.5",
  };

  const buttonSizeClasses = {
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  return (
    <div
      className={cn(
        "flex items-center bg-secondary rounded-full border border-border",
        sizeClasses[size],
        className
      )}
      role="radiogroup"
      aria-label="Select currency"
    >
      {(["CAD", "USD"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={currency === c}
          onClick={() => setCurrency(c)}
          className={cn(
            "rounded-full font-medium transition-colors",
            buttonSizeClasses[size],
            currency === c
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="mr-1">{FLAG_EMOJI[c]}</span>
          {c}
        </button>
      ))}
    </div>
  );
}
