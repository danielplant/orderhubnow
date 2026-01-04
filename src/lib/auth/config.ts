import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { mapUserTypeToRole } from '@/lib/types/auth'

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        loginId: { label: 'Login ID', type: 'text' },
        password: { label: 'Password', type: 'password' },
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
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
}
