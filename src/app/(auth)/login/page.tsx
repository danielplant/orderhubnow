import { redirect } from 'next/navigation'

export default function LoginPage() {
  // Legacy /login route - redirect to homepage
  // Users should use /admin/login or /rep/login
  redirect('/')
}
