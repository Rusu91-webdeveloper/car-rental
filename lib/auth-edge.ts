import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

const hasAuthEnv = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET
)

const nextAuth = hasAuthEnv
  ? NextAuth({
      providers: [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ],
      session: {
        strategy: "jwt",
      },
      secret: process.env.NEXTAUTH_SECRET,
    })
  : {
      auth: ((handler: any) => handler) as any,
    }

export const auth = nextAuth.auth
