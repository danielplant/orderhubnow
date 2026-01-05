import { redirect } from 'next/navigation'

/**
 * Rep dashboard - redirects to orders list.
 * Matches .NET: Reps land on RepOrders.aspx after login.
 */
export default function RepPage() {
  redirect('/rep/orders')
}
