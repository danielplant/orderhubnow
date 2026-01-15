// shadcn/ui components (Radix-based, accessible)
export { Button, buttonVariants } from "./button";
export { Input } from "./input";
export { SearchInput, type SearchInputProps } from "./search-input";
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "./popover";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./card";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./dropdown-menu";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./select";
export { Toaster } from "./sonner";

// Custom components (our design system)
export { Divider } from "./divider";
export { Badge } from "./badge";
export { IndicatorDot } from "./indicator-dot";
export { IconBox } from "./icon-box";
export { ColorSwatch } from "./color-swatch";
export { FabricSwatch } from "./fabric-swatch";
export { Text, textVariants, type TextProps } from "./text";
export { DataTable, dataTableVariants, type DataTableColumn, type DataTableProps } from "./data-table";
export { StatusBadge, statusBadgeVariants, type StatusBadgeProps } from "./status-badge";
export { MetricCard, metricCardVariants, type MetricCardProps } from "./metric-card";
export { TimePeriodSelector } from "./time-period-selector";

// Tree and inline editing components
export { TreeView, type TreeViewProps, type TreeNode } from "./tree-view";
export { InlineEdit, type InlineEditProps } from "./inline-edit";

// Date components
export { DateRangePopover, type DateRange, type DateRangePopoverProps } from "./date-range-popover";

// Feature interest
export { FeatureInterestModal, type FeatureInterestModalProps } from "./feature-interest-modal";