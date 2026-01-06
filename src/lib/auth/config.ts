import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { mapUserTypeToRole, type UserRole } from '@/lib/types/auth'
import { verifyPassword } from '@/lib/auth/password'

/**
 * Custom error codes for auth status blocking.
 * These are thrown from authorize() and handled in the login form.
 */
export const AUTH_ERROR_CODES = {
  INVITED: 'INVITED', // User hasn't set password yet
  DISABLED: 'DISABLED', // Account disabled
  RESET_REQUIRED: 'RESET_REQUIRED', // Legacy user or forced reset
} as const

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

        const loginId = credentials.loginId as string
        const password = credentials.password as string

        // Find user by Email or LoginID
        const user = await prisma.users.findFirst({
          where: {
            OR: [{ Email: loginId }, { LoginID: loginId }],
          },
        })

        if (!user) {
          console.log('[AUTH] User not found for loginId:', loginId)
          return null
        }

        console.log('[AUTH] Found user:', {
          ID: user.ID,
          LoginID: user.LoginID,
          UserType: user.UserType,
          HasPassword: !!user.Password,
          PasswordLength: user.Password?.length,
          HasPasswordHash: !!user.PasswordHash,
          Status: user.Status
        })

        // Admin users use legacy plaintext Password column (matches .NET BLL.cs behavior)
        // Skip Status/MustResetPassword/PasswordHash gates for admin
        const isAdmin = user.UserType?.toLowerCase() === 'admin'
        console.log('[AUTH] isAdmin:', isAdmin)

        if (isAdmin) {
          // Admin requires plaintext Password column
          if (!user.Password) {
            console.log('[AUTH] Admin has no Password field')
            return null // Fail if Password is NULL (no reset prompt for admin)
          }
          console.log('[AUTH] Comparing passwords - DB:', user.Password, 'Input:', password, 'Match:', user.Password === password)
          if (user.Password !== password) {
            console.log('[AUTH] Password mismatch for admin')
            return null
          }
          console.log('[AUTH] Admin password matched!')
          // Admin authenticated successfully - skip to role mapping
        } else {
          // Non-admin (Rep) authentication
          if (user.Status === 'invited') {
            throw new Error(AUTH_ERROR_CODES.INVITED)
          }

          if (user.Status === 'disabled') {
            throw new Error(AUTH_ERROR_CODES.DISABLED)
          }

          if (user.Status === 'legacy') {
            // Legacy reps use plaintext Password (matches .NET system)
            console.log('[AUTH] Legacy rep - checking plaintext password')
            if (!user.Password || user.Password !== password) {
              console.log('[AUTH] Legacy rep password mismatch')
              return null
            }
            console.log('[AUTH] Legacy rep password matched!')
            // Password matched - continue to role mapping below
          } else {
            // Active users with PasswordHash
            if (user.MustResetPassword) {
              throw new Error(AUTH_ERROR_CODES.RESET_REQUIRED)
            }
            if (!user.PasswordHash) {
              throw new Error(AUTH_ERROR_CODES.RESET_REQUIRED)
            }
            // Verify password against hash
            const passwordValid = await verifyPassword(password, user.PasswordHash)
            if (!passwordValid) {
              return null
            }
          }
        }

        // Map role - reject if unknown
        const role = mapUserTypeToRole(user.UserType)
        if (!role) {
          return null
        }

        // Server-side role enforcement
        const requiredRole = credentials.requiredRole as UserRole | undefined
        if (requiredRole && role !== requiredRole) {
          return null
        }

        console.log('[AUTH] Login successful, returning user object')
        return {
          id: String(user.ID), // NextAuth expects string id
          loginId: user.Email || user.LoginID,
          role,
          repId: user.RepId,
          name: user.Email || user.LoginID,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = Number(user.id) // Convert string back to number
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
