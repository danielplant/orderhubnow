/**
 * Types for feature interest tracking.
 */

export interface LogFeatureInterestInput {
  feature: string
  selectedOptions?: string[]
  freeText?: string
  orderId?: string
  orderNumber?: string
}

export interface LogFeatureInterestResult {
  success: boolean
  error?: string
}
