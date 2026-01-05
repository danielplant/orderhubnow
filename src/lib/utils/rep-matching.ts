/**
 * Rep matching utility for buyer order form.
 * Matches .NET FillCustomerInfo() behavior for auto-selecting rep based on customer's rep code.
 */

export interface RepOption {
  id: string
  name: string
  code: string
}

/**
 * Find a rep that matches the customer's rep code.
 * Uses same priority as .NET FillCustomerInfo():
 * 1. Exact code match (case-insensitive)
 * 2. Code contains customer rep (case-insensitive)
 * 3. Name contains customer rep (case-insensitive)
 *
 * @param customerRep - The customer's rep code from Customers.Rep
 * @param reps - Available reps list
 * @returns Matching rep or null if no match
 */
export function findRepByCustomerCode(
  customerRep: string | null | undefined,
  reps: RepOption[]
): RepOption | null {
  if (!customerRep || !customerRep.trim()) {
    return null
  }

  const searchTerm = customerRep.trim().toLowerCase()

  // 1. Exact code match (case-insensitive)
  const exactMatch = reps.find(
    (rep) => rep.code.toLowerCase() === searchTerm
  )
  if (exactMatch) {
    return exactMatch
  }

  // 2. Code contains customer rep (case-insensitive)
  const codeContains = reps.find(
    (rep) => rep.code.toLowerCase().includes(searchTerm)
  )
  if (codeContains) {
    return codeContains
  }

  // 3. Name contains customer rep (case-insensitive)
  const nameContains = reps.find(
    (rep) => rep.name.toLowerCase().includes(searchTerm)
  )
  if (nameContains) {
    return nameContains
  }

  return null
}
