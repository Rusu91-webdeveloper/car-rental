"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function toggleSavedCar(carId: string) {
  const user = await requireAuth()

  const existing = await prisma.savedCar.findUnique({
    where: {
      userId_carId: {
        userId: user.id,
        carId,
      },
    },
  })

  if (existing) {
    await prisma.savedCar.delete({ where: { id: existing.id } })
  } else {
    await prisma.savedCar.create({
      data: {
        userId: user.id,
        carId,
      },
    })
  }

  revalidatePath("/")
  revalidatePath("/saved")
  revalidatePath(`/cars/${carId}`)

  return { saved: !existing }
}
