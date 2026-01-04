import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { mapUserTypeToRole, type UserRole } from '@/lib/types/auth'

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        loginId: { label: 'Login ID', type: 'text' },
        password: { label: 'Password', type: 'password' },
        requiredRole: { label: 'Required Role', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) {
          return null
        }

        // Query user (minimal first - no relations)
        const user = await prisma.users.findFirst({
          where: {
            LoginID: credentials.loginId as string,
            Password: credentials.password as string, // Plaintext (legacy)
          },
        })

        if (!user) {
          return null
        }

        // Map role - reject if unknown
        const role = mapUserTypeToRole(user.UserType)
        if (!role) {
          return null
        }

        // Server-side role enforcement: if a specific role is required,
        // reject if user's role doesn't match (same error as wrong password)
        const requiredRole = credentials.requiredRole as UserRole | undefined
        if (requiredRole && role !== requiredRole) {
          return null
        }

        return {
          id: user.ID,
          loginId: user.LoginID,
          role,
          repId: user.RepId,
          name: user.LoginID, // Use LoginID as name for now
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as number
        token.loginId = user.loginId
        token.role = user.role
        token.repId = user.repId
        token.name = user.name
      }
      return token
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        loginId: token.loginId,
        role: token.role,
        repId: token.repId,
        name: token.name,
      } as typeof session.user
      return session
    },
  },
  // No pages.signIn - middleware handles role-specific login redirects
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
}
