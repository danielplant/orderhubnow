import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center">MyOrderHub</h1>
        <Suspense fallback={<div>Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
