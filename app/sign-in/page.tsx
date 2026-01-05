import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { defaultLocale, locales } from "@/i18n"

type SearchParams = Record<string, string | string[] | undefined>

const resolveLocale = async () => {
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value
  if (cookieLocale && locales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale
  }

  const acceptLanguage = (await headers()).get("accept-language") || ""
  const preferred = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean)

  for (const language of preferred) {
    const base = language.split("-")[0]
    if (locales.includes(base as (typeof locales)[number])) {
      return base
    }
  }

  return defaultLocale
}

export default async function SignInRedirect({ searchParams }: { searchParams?: SearchParams }) {
  const locale = await resolveLocale()
  const params = new URLSearchParams()

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item) params.append(key, item)
        })
      } else if (value) {
        params.set(key, value)
      }
    }
  }

  const query = params.toString()
  const target = query ? `/${locale}/sign-in?${query}` : `/${locale}/sign-in`
  redirect(target)
}
