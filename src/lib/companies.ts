/**
 * Company data model for multi-tenant support.
 * Each company represents a brand/business that uses OrderHubNow.
 */

/**
 * Route configuration for a company's portals.
 */
export interface CompanyRoutes {
  /** Customer shopping experience */
  customer: string;
  /** Sales rep dashboard */
  rep: string;
  /** Quick order flow for reps */
  repOrder: string;
  /** Admin portal */
  admin: string;
}

/**
 * Logo configuration with variants for different backgrounds.
 */
export interface CompanyLogos {
  /** Primary logo (for light backgrounds) */
  primary: string;
  /** Inverted logo (for dark backgrounds) */
  dark: string;
}

/**
 * Brand color configuration.
 */
export interface CompanyColors {
  /** Primary brand color (hex) */
  primary: string;
  /** Secondary brand color (hex) */
  secondary: string;
  /** Accent color (hex) */
  accent: string;
}

/**
 * Company definition for multi-tenant support.
 */
export interface Company {
  /** URL-safe identifier (e.g., 'limeapple-preppygoose') */
  slug: string;
  /** Display name */
  name: string;
  /** Optional tagline or description */
  tagline?: string;
  /** Logo assets */
  logos: CompanyLogos;
  /** Brand colors */
  colors: CompanyColors;
  /** Portal routes */
  routes: CompanyRoutes;
  /** External Shopify store URL (for e-commerce link) */
  shopifyUrl: string;
  /** External marketplace URL (e.g., Faire) */
  faireUrl?: string;
}

/**
 * Registry of all companies on the platform.
 * Add new companies here to enable multi-tenant support.
 */
export const COMPANIES: Company[] = [
  {
    slug: "limeapple-preppygoose",
    name: "Limeapple + Preppy Goose",
    tagline: "Girls activewear, loungewear & swim",
    logos: {
      primary: "/logos/limeapple-logo.png",
      dark: "/logos/limeapple-logo-bk.png",
    },
    colors: {
      primary: "#90FCCC", // limeapple green
      secondary: "#06D0E6", // preppy cyan
      accent: "#F2BAC9", // sale pink
    },
    routes: {
      customer: "/buyer/select-journey",
      rep: "/rep",
      repOrder: "/rep/login?callbackUrl=/rep/new-order",
      admin: "/admin",
    },
    shopifyUrl: "https://limeapple.com",
    faireUrl: "https://faire.com/brand/b_limeapple",
  },
];

/**
 * Get a company by its slug.
 * @param slug - The URL-safe company identifier
 * @returns The company or undefined if not found
 */
export function getCompanyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((company) => company.slug === slug);
}

/**
 * Get all available company slugs.
 * Useful for static path generation.
 */
export function getAllCompanySlugs(): string[] {
  return COMPANIES.map((company) => company.slug);
}

/**
 * Check if a slug is valid.
 */
export function isValidCompanySlug(slug: string): boolean {
  return COMPANIES.some((company) => company.slug === slug);
}
