/**
 * Email Types for Order Confirmation Popup
 *
 * These types support the email confirmation popup shown after order submission,
 * allowing users to toggle which emails are sent and add additional recipients.
 */

/**
 * Email preferences set by user in the order confirmation popup.
 * Controls which emails are sent and to whom.
 */
export interface OrderEmailPreferences {
  /** Send customer confirmation email */
  sendCustomer: boolean
  /** Send notification to rep (Reps.Email1) */
  sendRep: boolean
  /** Send notification to admin (SalesTeamEmails) */
  sendAdmin: boolean
  /** Additional recipients for customer confirmation email */
  additionalCustomerRecipients: string[]
  /** Additional recipients for sales/rep notification email */
  additionalSalesRecipients: string[]
  /** Whether to save sendRep as default for this rep */
  saveAsRepDefault?: boolean
}

/**
 * Computed recipient information for displaying in the popup.
 * Fetched from order data and email settings.
 */
export interface EmailRecipientInfo {
  /** Customer email from order */
  customerEmail: string | null
  /** Rep email from Reps.Email1 */
  repEmail: string | null
  /** Rep name for display */
  repName: string | null
  /** Admin emails from EmailSettings.SalesTeamEmails */
  adminEmails: string[]
  /** CC emails from EmailSettings.CCEmails */
  ccEmails: string[]
  /** Rep's default preference for sending order emails */
  repDefaultSendEmail: boolean
}

/**
 * Result of sending order emails with preferences.
 */
export interface SendOrderEmailsResult {
  customerEmailSent: boolean
  salesEmailSent: boolean
  errors: string[]
}
