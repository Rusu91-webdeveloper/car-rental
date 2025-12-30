"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

// Demo mode store - used when integrations are not configured
interface DemoUser {
  id: string
  email: string
  name: string
  role: "user" | "admin"
}

interface DemoCar {
  id: string
  slug: string
  name: string
  subtitle?: string
  description: string
  category: string
  price: number
  image: string
  status: string
  gearbox: string
  seats: number
  fuelType: string
  acceleration: string
  rating: number
  reviewCount: number
}

interface DemoBooking {
  id: string
  userId: string
  carId: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  status: string
  paymentStatus: string
  transferCode: string
  createdAt: string
}

interface DemoStore {
  user: DemoUser | null
  cars: DemoCar[]
  bookings: DemoBooking[]
  setUser: (user: DemoUser | null) => void
  login: (email: string, password: string) => Promise<DemoUser>
  logout: () => void
  createBooking: (
    booking: Omit<DemoBooking, "id" | "createdAt" | "status" | "paymentStatus" | "transferCode">,
  ) => DemoBooking
  updateBookingStatus: (id: string, status: string) => void
}

const demoUsers: DemoUser[] = [
  { id: "demo-admin", email: "admin@rentcar.com", name: "Demo Admin", role: "admin" },
  { id: "demo-user", email: "demo@example.com", name: "Demo User", role: "user" },
]

const demoCars: DemoCar[] = [
  {
    id: "tesla-model-3",
    slug: "tesla-model-3",
    name: "Tesla Model 3",
    subtitle: "Long Range • 2023",
    description: "Experience the future of driving with the Tesla Model 3.",
    category: "ELECTRIC",
    price: 8500,
    image: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800",
    status: "AVAILABLE",
    gearbox: "Automatic",
    seats: 5,
    fuelType: "Electric",
    acceleration: "3.1sec",
    rating: 4.9,
    reviewCount: 128,
  },
  {
    id: "bmw-3-series",
    slug: "bmw-3-series",
    name: "BMW 3 Series",
    subtitle: "Sport Line • 2023",
    description: "The BMW 3 Series delivers the perfect blend of luxury and performance.",
    category: "LUXURY",
    price: 12000,
    image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800",
    status: "AVAILABLE",
    gearbox: "Automatic",
    seats: 5,
    fuelType: "Gas",
    acceleration: "5.6sec",
    rating: 4.7,
    reviewCount: 89,
  },
]

export const useDemoStore = create<DemoStore>()(
  persist(
    (set, get) => ({
      user: null,
      cars: demoCars,
      bookings: [],

      setUser: (user) => set({ user }),

      login: async (email, password) => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const user = demoUsers.find((u) => u.email === email)
        if (!user) throw new Error("Invalid credentials")
        set({ user })
        return user
      },

      logout: () => set({ user: null }),

      createBooking: (bookingData) => {
        const booking: DemoBooking = {
          ...bookingData,
          id: `demo-booking-${Date.now()}`,
          status: "PENDING",
          paymentStatus: "PAID",
          transferCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
          createdAt: new Date().toISOString(),
        }
        set({ bookings: [...get().bookings, booking] })
        return booking
      },

      updateBookingStatus: (id, status) => {
        set({
          bookings: get().bookings.map((b) => (b.id === id ? { ...b, status } : b)),
        })
      },
    }),
    { name: "demo-rentcar-storage" },
  ),
)
