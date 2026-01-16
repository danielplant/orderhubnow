import { LogoutButton } from '@/components/auth/logout-button'

interface PortalHeaderProps {
  title: string
  userName: string
  logoutUrl: string
}

export function PortalHeader({ title, userName, logoutUrl }: PortalHeaderProps) {
  return (
    <header className="border-b bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">OrderHub — {title}</div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Logged in as <span className="font-medium text-foreground">{userName}</span>
          </span>
          <LogoutButton callbackUrl={logoutUrl} />
        </div>
      </div>
    </header>
  )
}
