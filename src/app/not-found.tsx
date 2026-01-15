import Link from 'next/link'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-muted-foreground/20">404</h1>
          <h2 className="text-2xl font-semibold text-foreground mt-4">
            Page Not Found
          </h2>
          <p className="text-muted-foreground mt-2">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default">
            <Link href="/">
              <Home className="size-4 mr-2" />
              Go Home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="javascript:history.back()">
              <ArrowLeft className="size-4 mr-2" />
              Go Back
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          OrderHub — Wholesale Ordering Platform
        </p>
      </div>
    </div>
  )
}
