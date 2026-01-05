/**
 * Form normalization utilities for buyer order form.
 * Ensures customer data from DB conforms to orderFormSchema requirements.
 */

/**
 * US state abbreviations map.
 */
const US_STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
}

/**
 * Canadian province abbreviations map.
 */
const CA_PROVINCES: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  newfoundland: 'NL',
  'nova scotia': 'NS',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  'northwest territories': 'NT',
  nunavut: 'NU',
  yukon: 'YT',
}

/**
 * Normalize state/province to max 3 characters.
 * Schema requires stateProvince.max(3).
 *
 * @param val - Raw state/province value from customer record
 * @returns Normalized value (2-3 char abbreviation) or empty string
 */
export function normalizeStateProvince(val: string | null | undefined): string {
  if (!val || !val.trim()) {
    return ''
  }

  const trimmed = val.trim()
  const lower = trimmed.toLowerCase()

  // Check if it's already a valid abbreviation (2-3 chars)
  if (trimmed.length <= 3) {
    return trimmed.toUpperCase()
  }

  // Try to map full state/province name to abbreviation
  const usAbbr = US_STATES[lower]
  if (usAbbr) {
    return usAbbr
  }

  const caAbbr = CA_PROVINCES[lower]
  if (caAbbr) {
    return caAbbr
  }

  // Fallback: truncate to first 3 characters
  return trimmed.slice(0, 3).toUpperCase()
}

/**
 * Normalize country to exactly 'USA' or 'Canada'.
 * Schema requires country to be one of these two values.
 *
 * @param val - Raw country value from customer record
 * @returns 'USA' or 'Canada' (defaults to 'USA')
 */
export function normalizeCountry(val: string | null | undefined): 'USA' | 'Canada' {
  if (!val || !val.trim()) {
    return 'USA'
  }

  const lower = val.trim().toLowerCase()

  // Check for Canada variations
  if (
    lower === 'canada' ||
    lower === 'ca' ||
    lower === 'can' ||
    lower.includes('canada')
  ) {
    return 'Canada'
  }

  // Everything else defaults to USA (including US, United States, USA, blank, etc.)
  return 'USA'
}

/**
 * Normalize website to a valid URL or empty string.
 * Schema requires url format or empty string.
 *
 * @param val - Raw website value from customer record
 * @returns Valid URL string or empty string
 */
export function normalizeWebsite(val: string | null | undefined): string {
  if (!val || !val.trim()) {
    return ''
  }

  const trimmed = val.trim()

  // Already has protocol - validate it looks like a URL
  if (trimmed.match(/^https?:\/\//i)) {
    return trimmed
  }

  // Has a domain-like structure (contains dot) - prepend https://
  if (trimmed.includes('.')) {
    return `https://${trimmed}`
  }

  // Doesn't look like a valid URL - return empty
  return ''
}
