import { auth } from '@/lib/auth/providers'
import { redirect } from 'next/navigation'
import { getEmailSettings } from '@/lib/data/queries/settings'
import { getEmailLogs, getEmailLogStats } from '@/lib/data/queries/email-logs'
import { EmailManagement } from '@/components/admin/email-management'

export const dynamic = 'force-dynamic'

export default async function EmailPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/admin/login')
  }

  // Get date 7 days ago for default filter
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [emailSettings, logsResult, stats] = await Promise.all([
    getEmailSettings(),
    getEmailLogs({ dateFrom: sevenDaysAgo }, 100, 0),
    getEmailLogStats(sevenDaysAgo),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Management</h1>
        <p className="text-muted-foreground">
          Configure email delivery and view send history.
        </p>
      </div>

      <EmailManagement
        emailSettings={emailSettings}
        initialLogs={logsResult.logs}
        initialStats={stats}
      />
    </div>
  )
}
