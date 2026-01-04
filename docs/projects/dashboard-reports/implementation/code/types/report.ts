/**
 * Report Types for Analytics Platform
 * ============================================================================
 * Defines all report types, their configurations, and data structures.
 * Path: src/lib/types/report.ts
 */

// ============================================================================
// Report Type Definitions
// ============================================================================

export type ReportType =
  | 'category-totals'
  | 'po-sold'
  | 'exception'
  | 'cohort-retention'
  | 'account-potential'
  | 'sku-velocity'
  | 'rep-scorecard'
  | 'customer-ltv'
  | 'first-to-second';

export interface ReportConfig {
  id: ReportType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  status: 'ready' | 'needs-schema' | 'planned';
  defaultColumns: string[];
  allColumns: ColumnDefinition[];
  supportedLayouts: LayoutMode[];
  supportedFilters: FilterField[];
  exportFormats: ExportFormat[];
}

export type LayoutMode = 'flat' | 'grouped' | 'pivot';
export type ExportFormat = 'xlsx' | 'pdf' | 'csv' | 'png';

// ============================================================================
// Column Definitions
// ============================================================================

export interface ColumnDefinition {
  id: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'percent' | 'badge';
  sortable: boolean;
  defaultVisible: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

// ============================================================================
// Filter Definitions
// ============================================================================

export interface FilterField {
  id: string;
  label: string;
  type: 'select' | 'searchable' | 'date' | 'number' | 'boolean';
  operators: FilterOperator[];
  options?: FilterOption[]; // For select/searchable
}

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'between';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterState {
  fieldId: string;
  operator: FilterOperator;
  value: string | number | [string, string];
}

// ============================================================================
// Saved View
// ============================================================================

export interface SavedView {
  id: string;
  name: string;
  reportType: ReportType;
  columns: string[];
  columnOrder: string[];
  filters: FilterState[];
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  layout: LayoutMode;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// URL State
// ============================================================================

export interface ReportURLState {
  type: ReportType;
  cols?: string; // Comma-separated column IDs
  filters?: string; // Encoded filter state
  sort?: string; // columnId
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  layout?: LayoutMode;
  view?: string; // Saved view ID
}

// ============================================================================
// Report Data Structures
// ============================================================================

// Category Totals
export interface CategoryTotalRow {
  mainCategory: string;
  subCategory: string;
  skuCount: number;
  quantity: number;
  weeksOfSupply?: number;
  sellThroughRate?: number;
}

// PO Sold
export interface POSoldRow {
  sku: string;
  categoryName: string;
  size2?: number;
  size3?: number;
  size4?: number;
  size5?: number;
  size6?: number;
  size7?: number;
  size8?: number;
  size10?: number;
  size12?: number;
  size14?: number;
  size16?: number;
  sizeOS?: number;
  total: number;
}

// Exception Report
export type ExceptionType = 
  | 'late-account'
  | 'declining-account'
  | 'stalled-new-account'
  | 'dead-sku'
  | 'hot-sku'
  | 'underperforming-rep';

export interface ExceptionRow {
  type: ExceptionType;
  entityId: string;
  entityName: string;
  metric: string;
  expected: string;
  actual: string;
  severity: 'high' | 'medium' | 'low';
  daysSinceTriggered: number;
  actions: string[];
}

// SKU Velocity
export type VelocityHealthScore = 'reorder-now' | 'reorder-soon' | 'monitor' | 'overstock' | 'discontinue';

export interface SKUVelocityRow {
  sku: string;
  category: string;
  inventory: number;
  unitsSold30d: number;
  dailyVelocity: number;
  daysOfSupply: number;
  trend: 'up' | 'flat' | 'down';
  healthScore: VelocityHealthScore;
  recommendedAction: string;
}

// Cohort Retention
export interface CohortRow {
  cohortMonth: string; // YYYY-MM
  size: number;
  m1: number;
  m2: number;
  m3: number;
  m6: number;
  m12: number;
  ltv: number;
}

// Account Potential
export type AccountQuadrant = 'stars' | 'develop' | 'maintain' | 'harvest';

export interface AccountPotentialRow {
  customerId: number;
  storeName: string;
  currentRevenue: number;
  estimatedPotential: number;
  gapAmount: number;
  quadrant: AccountQuadrant;
  rep: string;
  region: string;
}

// Rep Scorecard
export interface RepScorecardRow {
  repId: number;
  repName: string;
  territory: string;
  activeAccounts: number;
  revenue: number;
  revenueRank: number;
  targetAmount: number;
  percentOfTarget: number;
  targetRank: number;
  shareOfPotential: number;
  potentialRank: number;
  newAccounts: number;
  reactivatedAccounts: number;
  avgOrderValue: number;
}

// Customer LTV
export interface CustomerLTVRow {
  customerId: number;
  storeName: string;
  segment: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  ltv: number;
  orderCount: number;
  avgOrderValue: number;
  firstCategory: string;
  acquisitionRep: string;
  daysSinceFirstOrder: number;
  daysSinceLastOrder: number;
}

// First-to-Second Conversion
export interface FirstToSecondRow {
  cohortMonth: string;
  newCustomers: number;
  convertedCustomers: number;
  conversionRate: number;
  avgDaysToSecond: number;
  firstOrderAOV: number;
  secondOrderAOV: number;
  aovLift: number;
}

// ============================================================================
// Report Configurations
// ============================================================================

export const REPORT_CONFIGS: Record<ReportType, ReportConfig> = {
  'category-totals': {
    id: 'category-totals',
    name: 'Category Totals',
    description: 'Inventory totals grouped by category',
    icon: 'LayoutGrid',
    status: 'ready',
    defaultColumns: ['mainCategory', 'subCategory', 'quantity'],
    allColumns: [
      { id: 'mainCategory', label: 'Main Category', type: 'string', sortable: true, defaultVisible: true },
      { id: 'subCategory', label: 'Sub Category', type: 'string', sortable: true, defaultVisible: true },
      { id: 'skuCount', label: 'SKU Count', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'quantity', label: 'Quantity', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'weeksOfSupply', label: 'Weeks of Supply', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'sellThroughRate', label: 'Sell-Through %', type: 'percent', sortable: true, defaultVisible: false, align: 'right' },
    ],
    supportedLayouts: ['grouped', 'flat'],
    supportedFilters: [
      { id: 'mainCategory', label: 'Main Category', type: 'select', operators: ['eq', 'neq'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'po-sold': {
    id: 'po-sold',
    name: 'PO Sold',
    description: 'Purchase orders and committed quantities by size',
    icon: 'ShoppingCart',
    status: 'ready',
    defaultColumns: ['sku', 'categoryName', 'total'],
    allColumns: [
      { id: 'sku', label: 'SKU', type: 'string', sortable: true, defaultVisible: true },
      { id: 'categoryName', label: 'Category', type: 'string', sortable: true, defaultVisible: true },
      { id: 'size2', label: '2', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size3', label: '3', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size4', label: '4', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size5', label: '5', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size6', label: '6', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size7', label: '7', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size8', label: '8', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size10', label: '10', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size12', label: '12', type: 'number', sortable: false, defaultVisible: true, align: 'right' },
      { id: 'size14', label: '14', type: 'number', sortable: false, defaultVisible: false, align: 'right' },
      { id: 'size16', label: '16', type: 'number', sortable: false, defaultVisible: false, align: 'right' },
      { id: 'sizeOS', label: 'O/S', type: 'number', sortable: false, defaultVisible: false, align: 'right' },
      { id: 'total', label: 'Total', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
    ],
    supportedLayouts: ['pivot', 'flat'],
    supportedFilters: [
      { id: 'categoryName', label: 'Category', type: 'searchable', operators: ['eq', 'contains'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'exception': {
    id: 'exception',
    name: 'Exception Report',
    description: 'Anomalies that need attention',
    icon: 'AlertTriangle',
    status: 'needs-schema',
    defaultColumns: ['entityName', 'type', 'metric', 'severity'],
    allColumns: [
      { id: 'entityName', label: 'Name', type: 'string', sortable: true, defaultVisible: true },
      { id: 'type', label: 'Exception Type', type: 'badge', sortable: true, defaultVisible: true },
      { id: 'metric', label: 'Metric', type: 'string', sortable: false, defaultVisible: true },
      { id: 'expected', label: 'Expected', type: 'string', sortable: false, defaultVisible: true },
      { id: 'actual', label: 'Actual', type: 'string', sortable: false, defaultVisible: true },
      { id: 'severity', label: 'Severity', type: 'badge', sortable: true, defaultVisible: true },
      { id: 'daysSinceTriggered', label: 'Days', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [
      { id: 'type', label: 'Exception Type', type: 'select', operators: ['eq'] },
      { id: 'severity', label: 'Severity', type: 'select', operators: ['eq'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'sku-velocity': {
    id: 'sku-velocity',
    name: 'SKU Velocity',
    description: 'Inventory velocity and recommended actions',
    icon: 'TrendingUp',
    status: 'ready',
    defaultColumns: ['sku', 'category', 'inventory', 'daysOfSupply', 'healthScore'],
    allColumns: [
      { id: 'sku', label: 'SKU', type: 'string', sortable: true, defaultVisible: true },
      { id: 'category', label: 'Category', type: 'string', sortable: true, defaultVisible: true },
      { id: 'inventory', label: 'Inventory', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'unitsSold30d', label: 'Sold (30d)', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'dailyVelocity', label: 'Daily Velocity', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'daysOfSupply', label: 'Days of Supply', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'trend', label: 'Trend', type: 'badge', sortable: true, defaultVisible: true },
      { id: 'healthScore', label: 'Health', type: 'badge', sortable: true, defaultVisible: true },
      { id: 'recommendedAction', label: 'Action', type: 'string', sortable: false, defaultVisible: true },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [
      { id: 'healthScore', label: 'Health Score', type: 'select', operators: ['eq'] },
      { id: 'category', label: 'Category', type: 'searchable', operators: ['eq', 'contains'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'cohort-retention': {
    id: 'cohort-retention',
    name: 'Cohort Retention',
    description: 'Customer retention by acquisition month',
    icon: 'Users',
    status: 'needs-schema',
    defaultColumns: ['cohortMonth', 'size', 'm1', 'm2', 'm3', 'm6', 'm12', 'ltv'],
    allColumns: [
      { id: 'cohortMonth', label: 'Cohort', type: 'string', sortable: true, defaultVisible: true },
      { id: 'size', label: 'Size', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'm1', label: 'M1', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'm2', label: 'M2', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'm3', label: 'M3', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'm6', label: 'M6', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'm12', label: 'M12', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'ltv', label: 'LTV', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [],
    exportFormats: ['xlsx', 'png'],
  },
  
  'account-potential': {
    id: 'account-potential',
    name: 'Account Potential',
    description: 'Current revenue vs estimated potential',
    icon: 'Target',
    status: 'needs-schema',
    defaultColumns: ['storeName', 'currentRevenue', 'estimatedPotential', 'quadrant', 'rep'],
    allColumns: [
      { id: 'storeName', label: 'Store', type: 'string', sortable: true, defaultVisible: true },
      { id: 'currentRevenue', label: 'Current Revenue', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'estimatedPotential', label: 'Est. Potential', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'gapAmount', label: 'Gap', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'quadrant', label: 'Quadrant', type: 'badge', sortable: true, defaultVisible: true },
      { id: 'rep', label: 'Rep', type: 'string', sortable: true, defaultVisible: true },
      { id: 'region', label: 'Region', type: 'string', sortable: true, defaultVisible: false },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [
      { id: 'quadrant', label: 'Quadrant', type: 'select', operators: ['eq'] },
      { id: 'rep', label: 'Rep', type: 'searchable', operators: ['eq'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'rep-scorecard': {
    id: 'rep-scorecard',
    name: 'Rep Scorecard',
    description: 'Sales rep performance with normalized targets',
    icon: 'Award',
    status: 'needs-schema',
    defaultColumns: ['repName', 'revenue', 'percentOfTarget', 'newAccounts', 'avgOrderValue'],
    allColumns: [
      { id: 'repName', label: 'Rep', type: 'string', sortable: true, defaultVisible: true },
      { id: 'territory', label: 'Territory', type: 'string', sortable: true, defaultVisible: false },
      { id: 'activeAccounts', label: 'Active Accounts', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'revenue', label: 'Revenue', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'revenueRank', label: 'Rev Rank', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'targetAmount', label: 'Target', type: 'currency', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'percentOfTarget', label: '% of Target', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'targetRank', label: 'Target Rank', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'newAccounts', label: 'New Accounts', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'reactivatedAccounts', label: 'Reactivated', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'avgOrderValue', label: 'Avg Order', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [
      { id: 'territory', label: 'Territory', type: 'select', operators: ['eq'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'customer-ltv': {
    id: 'customer-ltv',
    name: 'Customer LTV',
    description: 'Customer lifetime value analysis',
    icon: 'DollarSign',
    status: 'needs-schema',
    defaultColumns: ['storeName', 'segment', 'ltv', 'orderCount', 'avgOrderValue'],
    allColumns: [
      { id: 'storeName', label: 'Store', type: 'string', sortable: true, defaultVisible: true },
      { id: 'segment', label: 'Segment', type: 'badge', sortable: true, defaultVisible: true },
      { id: 'ltv', label: 'LTV', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'orderCount', label: 'Orders', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'avgOrderValue', label: 'Avg Order', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'firstCategory', label: 'First Category', type: 'string', sortable: true, defaultVisible: false },
      { id: 'acquisitionRep', label: 'Acq. Rep', type: 'string', sortable: true, defaultVisible: false },
      { id: 'daysSinceFirstOrder', label: 'Days Since First', type: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'daysSinceLastOrder', label: 'Days Since Last', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [
      { id: 'segment', label: 'Segment', type: 'select', operators: ['eq'] },
      { id: 'acquisitionRep', label: 'Acq. Rep', type: 'searchable', operators: ['eq'] },
    ],
    exportFormats: ['xlsx', 'pdf'],
  },
  
  'first-to-second': {
    id: 'first-to-second',
    name: 'First-to-Second',
    description: 'New customer conversion to repeat buyer',
    icon: 'RefreshCw',
    status: 'needs-schema',
    defaultColumns: ['cohortMonth', 'newCustomers', 'convertedCustomers', 'conversionRate', 'avgDaysToSecond'],
    allColumns: [
      { id: 'cohortMonth', label: 'Cohort', type: 'string', sortable: true, defaultVisible: true },
      { id: 'newCustomers', label: 'New', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'convertedCustomers', label: 'Converted', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'conversionRate', label: 'Rate', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'avgDaysToSecond', label: 'Avg Days', type: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'firstOrderAOV', label: '1st AOV', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'secondOrderAOV', label: '2nd AOV', type: 'currency', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'aovLift', label: 'AOV Lift', type: 'percent', sortable: true, defaultVisible: true, align: 'right' },
    ],
    supportedLayouts: ['flat'],
    supportedFilters: [],
    exportFormats: ['xlsx', 'pdf'],
  },
};

// Helper to get report config
export function getReportConfig(type: ReportType): ReportConfig {
  return REPORT_CONFIGS[type];
}

// Get all report configs as array
export function getAllReportConfigs(): ReportConfig[] {
  return Object.values(REPORT_CONFIGS);
}

// Get ready reports only
export function getReadyReports(): ReportConfig[] {
  return Object.values(REPORT_CONFIGS).filter(r => r.status === 'ready');
}
