/**
 * PPSizes table mapping.
 * Maps individual sizes to their prepack type (e.g., size 4 → "2pc").
 */
export interface PPSize {
  id: number // PPSizes.ID (Int)
  size: number // PPSizes.Size (Int) - the individual size number (2, 4, 6, etc.)
  correspondingPP: string // PPSizes.CorrespondingPP - e.g., "2pc", "3pc", "6pc"
}

export interface PPSizesListResult {
  items: PPSize[]
  total: number
}
