import type { ProductVariant, VariantStatus } from "./inventory";

/**
 * Input for building a ProductVariant - everything except availableDisplay
 * which is computed automatically.
 */
export type ProductVariantInput = {
  sku: string;
  size: string;
  available: number;
  onRoute: number;
  priceCad: number;
  priceUsd: number;
  status?: VariantStatus;
  expectedDate?: string;
  /** Override the computed availableDisplay if needed (e.g., for blank display) */
  availableDisplay?: string;
};

/**
 * Build a ProductVariant with availableDisplay computed from available.
 *
 * By default: availableDisplay = String(available)
 * Override by passing availableDisplay explicitly.
 */
export function buildVariant(input: ProductVariantInput): ProductVariant {
  const { availableDisplay, ...rest } = input;
  return {
    ...rest,
    availableDisplay: availableDisplay ?? String(input.available),
  };
}
