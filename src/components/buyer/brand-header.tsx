"use client";

import { Compass, Bell, Search, HelpCircle } from "lucide-react";
import { Button, Divider, IndicatorDot, IconBox, Badge } from "@/components/ui";
import { BRAND_NAME, APP_NAME } from "@/lib/constants/brand";
import { CurrencyToggle } from "./currency-toggle";

interface BrandHeaderProps {
  userInitials?: string;
}

export function BrandHeader({ userInitials = "?" }: BrandHeaderProps) {
  return (
    <header className="w-full h-16 bg-background border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      {/* Left: Brand */}
      <div className="flex items-center gap-3">
        <IconBox size="sm" variant="primary">
          <Compass className="h-5 w-5" />
        </IconBox>
        <Divider orientation="vertical" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight">{BRAND_NAME}</span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-medium text-muted-foreground">{APP_NAME}</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full border border-border">
          <IndicatorDot status="success" pulse />
          <span className="text-xs font-medium text-muted-foreground">Systems Operational</span>
        </div>

        {/* Currency Toggle */}
        <CurrencyToggle size="sm" className="hidden md:flex" />

        <Divider orientation="vertical" className="hidden md:block" />

        <Button variant="ghost" size="icon" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help">
          <HelpCircle className="h-4 w-4" />
        </Button>

        <Badge size="md" variant="default">
          {userInitials}
        </Badge>
      </div>
    </header>
  );
}
