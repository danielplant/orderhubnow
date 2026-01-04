export type UserRole = 'admin' | 'rep'

export interface SessionUser {
  id: number
  loginId: string
  role: UserRole
  repId: number | null
  name: string
}

// Map database UserType to our role type
export function mapUserTypeToRole(userType: string): UserRole | null {
  const normalized = userType.toLowerCase()
  if (normalized === 'admin') return 'admin'
  if (normalized === 'rep') return 'rep'
  return null // Unknown role - reject login
}
