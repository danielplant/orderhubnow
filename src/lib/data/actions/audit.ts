'use server'

/**
 * Audit logging for admin actions.
 *
 * Currently logs to server console. Structure ready for DB persistence
 * via CustomerOrderHistory table (EntityType: 'admin_view_as', Action: 'enter'|'view').
 */

interface AdminViewAsLogEntry {
  adminId: number
  adminLoginId: string
  viewAsRepId: number
  viewAsRepName?: string
  action: 'enter' | 'view' | 'exit'
  path?: string
  timestamp: Date
}

/**
 * Logs admin "view as rep" activity for audit trail.
 *
 * Call on:
 * - 'enter': When admin first enters view-as mode
 * - 'view': On page navigation within view-as mode (optional, can be noisy)
 * - 'exit': When admin exits view-as mode
 */
export async function logAdminViewAs(entry: AdminViewAsLogEntry): Promise<void> {
  const logData = {
    type: 'ADMIN_VIEW_AS',
    adminId: entry.adminId,
    adminLoginId: entry.adminLoginId,
    viewAsRepId: entry.viewAsRepId,
    viewAsRepName: entry.viewAsRepName ?? null,
    action: entry.action,
    path: entry.path ?? null,
    timestamp: entry.timestamp.toISOString(),
  }

  // Server-side logging (captured by hosting provider logs)
  console.log('[AUDIT]', JSON.stringify(logData))

  // TODO: Persist to database when ready
  // await prisma.customerOrderHistory.create({
  //   data: {
  //     EntityType: 'admin_view_as',
  //     Action: entry.action,
  //     Description: `Admin ${entry.adminLoginId} viewing as rep ${entry.viewAsRepId}`,
  //     NewValues: JSON.stringify(logData),
  //     DateAdded: entry.timestamp,
  //   },
  // })
}
