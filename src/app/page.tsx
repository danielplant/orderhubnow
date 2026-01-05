import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <main className="bg-background p-8 rounded-lg shadow-lg text-center max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2">MyOrderHub</h1>
        <p className="text-muted-foreground mb-8">
          Select your portal to sign in
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/admin"
            className="flex h-12 items-center justify-center rounded-md bg-foreground px-6 text-background font-medium transition-colors hover:bg-foreground/90"
          >
            Admin Portal
          </Link>
          <Link
            href="/rep"
            className="flex h-12 items-center justify-center rounded-md border border-input bg-background px-6 font-medium transition-colors hover:bg-muted"
          >
            Sales Rep Portal
          </Link>
          <div className="border-t border-border my-2" />
          <Link
            href="/buyer/select-journey"
            className="flex h-12 items-center justify-center rounded-md bg-primary px-6 text-primary-foreground font-medium transition-colors hover:bg-primary/90"
          >
            Shop as Customer
          </Link>
          <Link
            href="/rep/login?callbackUrl=/rep/new-order"
            className="flex h-12 items-center justify-center rounded-md border border-input bg-background px-6 font-medium transition-colors hover:bg-muted"
          >
            Rep: Order for Customer
          </Link>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Admin and Rep portals require sign in.
        </p>
      </main>
    </div>
  )
}
