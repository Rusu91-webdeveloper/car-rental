import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./db"
import { config } from "./config"
import type { Adapter } from "next-auth/adapters"
import type { JWT } from "next-auth/jwt"
import type { Role } from "@prisma/client"

type ApplicationJwt = JWT & {
  googleAuthenticatedAt?: number
  authenticationProvider?: "google"
  role?: Role
  isActive?: boolean
}

type ApplicationSessionEvidence = {
  googleAuthenticatedAt?: unknown
  authenticationProvider?: unknown
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma) as unknown as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      // User is automatically created by the adapter
      // After user is created, update role based on admin emails
      if (user.email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: user.email,
              mode: "insensitive",
            },
          },
          select: { isActive: true },
        })

        if (existingUser && !existingUser.isActive) {
          return false
        }

        const isAdmin = config.adminEmails.some(
          (adminEmail) => adminEmail.toLowerCase() === user.email!.toLowerCase()
        )

        if (isAdmin) {
          // Update user role to ADMIN
          await prisma.user.updateMany({
            where: {
              email: {
                equals: user.email,
                mode: "insensitive",
              },
            },
            data: { role: "ADMIN" },
          })
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      const applicationToken = token as ApplicationJwt
      if (account?.provider === "google") {
        // This timestamp is issued only while Auth.js is processing a verified
        // Google OAuth callback. Browser-provided timestamps are never accepted.
        applicationToken.googleAuthenticatedAt = Date.now()
        applicationToken.authenticationProvider = "google"
      }
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, isActive: true },
        })
        applicationToken.role =
          dbUser?.role ?? (user as typeof user & { role?: Role }).role
        applicationToken.isActive = dbUser?.isActive ?? true
      }
      return token
    },
    async session({ session, token }) {
      const applicationToken = token as ApplicationJwt
      if (session.user && token.sub) {
        session.user.id = token.sub
        const applicationUser = session.user as typeof session.user & {
          role?: Role
          isActive?: boolean
        }
        applicationUser.role = applicationToken.role
        applicationUser.isActive = applicationToken.isActive
        const applicationSession = session as typeof session &
          ApplicationSessionEvidence
        applicationSession.googleAuthenticatedAt =
          applicationToken.googleAuthenticatedAt
        applicationSession.authenticationProvider =
          applicationToken.authenticationProvider
      }
      return session
    },
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export async function getCurrentUser() {
  if (!config.features.authEnabled) {
    return null
  }

  const session = await auth()

  if (!session?.user?.id) {
    return null
  }

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, isActive: true },
  })

  return user
}

export async function getServerVerifiedGoogleAuthenticationEvidence() {
  const session = await auth()
  const applicationSession = session as
    | (typeof session & ApplicationSessionEvidence)
    | null
  const timestamp = applicationSession?.googleAuthenticatedAt
  if (
    !session?.user?.id ||
    applicationSession?.authenticationProvider !== "google" ||
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp)
  )
    return undefined
  return {
    userId: session.user.id,
    evidence: {
      provider: "google" as const,
      authenticatedAt: new Date(timestamp),
      serverVerified: true as const,
    },
  }
}

export async function requireAuth() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  return user
}

export async function requireAdmin() {
  const user = await requireAuth()

  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: Admin access required")
  }

  return user
}
