#!/usr/bin/env tsx

/**
 * Script to make a user an admin
 * Usage: pnpm tsx scripts/make-admin.ts user@example.com
 */

import { prisma } from "../lib/db"

async function makeAdmin(email: string) {
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
    })

    console.log(`✅ Successfully made ${user.email} an admin!`)
    console.log(`   Name: ${user.name || "N/A"}`)
    console.log(`   Role: ${user.role}`)
  } catch (error: any) {
    if (error.code === "P2025") {
      console.error(`❌ User with email ${email} not found`)
      console.log("\nAvailable users:")
      const users = await prisma.user.findMany({
        select: { email: true, name: true, role: true },
      })
      users.forEach((u) => {
        console.log(`   - ${u.email} (${u.name || "No name"}) - ${u.role}`)
      })
    } else {
      console.error("❌ Error:", error.message)
    }
    process.exit(1)
  }
}

const email = process.argv[2]

if (!email) {
  console.error("❌ Please provide an email address")
  console.log("Usage: pnpm tsx scripts/make-admin.ts user@example.com")
  process.exit(1)
}

makeAdmin(email)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

