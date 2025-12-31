import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "./db"
import { config } from "./config"

export async function getCurrentUser() {
  // In demo mode, return admin user without requiring Clerk
  if (config.isDemoMode) {
    const adminEmail = config.adminEmails[0] || "admin@rentcar.com"
    const demoClerkId = `demo_${adminEmail.toLowerCase().replace(/[^a-z0-9]/g, "_")}`

    return await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN" },
      create: {
        clerkId: demoClerkId,
        email: adminEmail,
        name: "Demo Admin",
        role: "ADMIN",
      },
    })
  }

  if (!config.features.authEnabled) {
    return null
  }

  const { userId } = await auth()

  if (!userId) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  })

  if (user) {
    return user
  }

  return syncUser()
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

export async function syncUser() {
  if (!config.features.authEnabled) {
    return null
  }

  const clerkUser = await currentUser()

  if (!clerkUser) {
    return null
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress

  if (!email) {
    return null
  }

  // Upsert user from Clerk to database
  const user = await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {
      email,
      name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || null,
    },
    create: {
      clerkId: clerkUser.id,
      email,
      name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || null,
      role: config.adminEmails.some((adminEmail) => adminEmail.toLowerCase() === email.toLowerCase())
        ? "ADMIN"
        : "USER",
    },
  })

  return user
}
