"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { normalizeFabric } from "@/lib/filters/normalize"
import { getPatternCSS, getPatternSize } from "@/lib/constants/fabric-patterns"
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"

const fabricSwatchVariants = cva(
  "rounded-sm ring-1 ring-border",
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
)

export interface FabricSwatchProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof fabricSwatchVariants> {
  fabric: string
}

export function FabricSwatch({
  fabric,
  size,
  className,
  ...props
}: FabricSwatchProps) {
  const normalized = normalizeFabric(fabric) ?? "Other"
  const pattern = getPatternCSS(normalized)
  const patternSize = getPatternSize(normalized)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(fabricSwatchVariants({ size }), className)}
          style={{
            backgroundImage: pattern,
            backgroundColor: "#f3f4f6",
            backgroundSize: patternSize,
          }}
          role="img"
          aria-label={`Fabric: ${fabric}`}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent>{fabric}</TooltipContent>
    </Tooltip>
  )
}

export { fabricSwatchVariants }
