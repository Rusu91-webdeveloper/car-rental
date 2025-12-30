"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface User {
  id: string
  email: string
  name: string
  role: "user" | "admin"
  createdAt: string
}

export interface Car {
  id: string
  name: string
  category: "ELECTRIC" | "LUXURY" | "SUV" | "SEDAN" | "EV"
  price: number
  image: string
  status: "AVAILABLE" | "LOW_STOCK" | "RENTED"
  specs: {
    gearbox: string
    seats: number
    fuel: string
    acceleration: string
  }
  rating: number
  reviews: number
  subtitle?: string
  description?: string
}

export interface Booking {
  id: string
  userId: string
  carId: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  status: "pending" | "confirmed" | "completed" | "cancelled"
  createdAt: string
}

interface AppState {
  user: User | null
  cars: Car[]
  bookings: Booking[]
  users: User[]
  savedCars: string[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  toggleSavedCar: (carId: string) => void
  setUser: (user: User | null) => void
  login: (email: string, password: string) => Promise<User>
  signup: (email: string, password: string, name: string) => Promise<User>
  logout: () => void
  addCar: (car: Omit<Car, "id">) => void
  updateCar: (id: string, car: Partial<Car>) => void
  deleteCar: (id: string) => void
  addBooking: (booking: Omit<Booking, "id" | "createdAt" | "status">) => void
  updateBooking: (id: string, booking: Partial<Booking>) => void
  deleteBooking: (id: string) => void
  getCarById: (id: string) => Car | undefined
  getBookingsByUserId: (userId: string) => Booking[]
  getAllUsers: () => User[]
}

const initialCars: Car[] = [
  {
    id: "tesla-model-3",
    name: "Tesla Model 3",
    subtitle: "Long Range • 2023",
    category: "ELECTRIC",
    price: 85,
    image: "/white-tesla-model-3-front-angle.jpg",
    status: "AVAILABLE",
    specs: {
      gearbox: "Automatic",
      seats: 5,
      fuel: "Electric",
      acceleration: "3.1sec",
    },
    rating: 4.9,
    reviews: 128,
    description:
      "Experience the future of driving with the Tesla Model 3. This fully electric sedan combines minimalist design with maximum performance. Featuring Autopilot capabilities, a glass roof, and a premium interior, it delivers a smooth, silent, and exhilarating ride perfect for both city commutes and long highway trips.",
  },
  {
    id: "bmw-3-series",
    name: "BMW 3 Series",
    subtitle: "Sport Line • 2023",
    category: "LUXURY",
    price: 120,
    image: "/placeholder.svg?height=400&width=600",
    status: "AVAILABLE",
    specs: {
      gearbox: "Automatic",
      seats: 5,
      fuel: "Gas",
      acceleration: "5.6sec",
    },
    rating: 4.7,
    reviews: 89,
    description:
      "The BMW 3 Series delivers the perfect blend of luxury and performance. With its sporty handling, premium interior materials, and advanced technology features, this sedan offers an exceptional driving experience.",
  },
  {
    id: "toyota-rav4",
    name: "Toyota RAV4",
    subtitle: "Hybrid • 2023",
    category: "SUV",
    price: 75,
    image: "/placeholder.svg?height=400&width=600",
    status: "LOW_STOCK",
    specs: {
      gearbox: "Automatic",
      seats: 5,
      fuel: "Hybrid",
      acceleration: "7.8sec",
    },
    rating: 4.5,
    reviews: 156,
    description:
      "The Toyota RAV4 Hybrid combines fuel efficiency with SUV versatility. Perfect for families and adventure seekers, it offers spacious cargo room, advanced safety features, and reliable performance.",
  },
  {
    id: "audi-a4",
    name: "Audi A4",
    subtitle: "Premium Plus • 2023",
    category: "SEDAN",
    price: 95,
    image: "/placeholder.svg?height=400&width=600",
    status: "AVAILABLE",
    specs: {
      gearbox: "Automatic",
      seats: 5,
      fuel: "Gas",
      acceleration: "5.9sec",
    },
    rating: 4.6,
    reviews: 72,
    description:
      "The Audi A4 brings sophisticated German engineering and luxury appointments to the compact sedan segment. With its refined interior and smooth ride quality, it's perfect for business and leisure travel.",
  },
]

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      cars: initialCars,
      bookings: [],
      users: [
        {
          id: "admin-1",
          email: "admin@rentcar.com",
          name: "Admin User",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
      ],
      savedCars: [],
      searchQuery: "",

      setSearchQuery: (query) => set({ searchQuery: query }),

      toggleSavedCar: (carId) => {
        const savedCars = get().savedCars
        if (savedCars.includes(carId)) {
          set({ savedCars: savedCars.filter((id) => id !== carId) })
        } else {
          set({ savedCars: [...savedCars, carId] })
        }
      },

      setUser: (user) => set({ user }),

      login: async (email, password) => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 500))

        const users = get().users
        const user = users.find((u) => u.email === email)

        if (!user) {
          throw new Error("Invalid email or password")
        }

        set({ user })
        return user
      },

      signup: async (email, password, name) => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 500))

        const users = get().users
        const existingUser = users.find((u) => u.email === email)

        if (existingUser) {
          throw new Error("User already exists")
        }

        const newUser: User = {
          id: `user-${Date.now()}`,
          email,
          name,
          role: "user",
          createdAt: new Date().toISOString(),
        }

        set({ users: [...users, newUser], user: newUser })
        return newUser
      },

      logout: () => set({ user: null }),

      addCar: (car) => {
        const newCar: Car = {
          ...car,
          id: `car-${Date.now()}`,
        }
        set({ cars: [...get().cars, newCar] })
      },

      updateCar: (id, updates) => {
        set({
          cars: get().cars.map((car) => (car.id === id ? { ...car, ...updates } : car)),
        })
      },

      deleteCar: (id) => {
        set({ cars: get().cars.filter((car) => car.id !== id) })
      },

      addBooking: (booking) => {
        const newBooking: Booking = {
          ...booking,
          id: `booking-${Date.now()}`,
          status: "pending",
          createdAt: new Date().toISOString(),
        }
        set({ bookings: [...get().bookings, newBooking] })
      },

      updateBooking: (id, updates) => {
        set({
          bookings: get().bookings.map((booking) => (booking.id === id ? { ...booking, ...updates } : booking)),
        })
      },

      deleteBooking: (id) => {
        set({ bookings: get().bookings.filter((booking) => booking.id !== id) })
      },

      getCarById: (id) => {
        return get().cars.find((car) => car.id === id)
      },

      getBookingsByUserId: (userId) => {
        return get().bookings.filter((booking) => booking.userId === userId)
      },

      getAllUsers: () => {
        return get().users
      },
    }),
    {
      name: "rentcar-storage",
    },
  ),
)
