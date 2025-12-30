import { createNavigation } from "next-intl/navigation"
import { locales, defaultLocale } from "./i18n"

const { Link, redirect, usePathname, useRouter } = createNavigation({
  locales,
  defaultLocale,
})

export { Link, redirect, usePathname, useRouter }
export default Link
