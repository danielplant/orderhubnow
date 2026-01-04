import { DefaultSession, DefaultUser } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: number
      loginId: string
      role: 'admin' | 'rep'
      repId: number | null
      name: string
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    id: number
    loginId: string
    role: 'admin' | 'rep'
    repId: number | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: number
    loginId: string
    role: 'admin' | 'rep'
    repId: number | null
  }
}
