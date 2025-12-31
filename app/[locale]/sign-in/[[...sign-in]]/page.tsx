import { SignIn } from "@clerk/nextjs"
import { config } from "@/lib/config"
import { redirect } from "@/navigation"

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams?: Promise<{ redirect_url?: string }>
}) {
  const { locale } = await params
  const searchParamsData = await searchParams
  
  // In demo mode, redirect to custom login (preserve redirect_url)
  if (config.isDemoMode) {
    const redirectUrl = searchParamsData?.redirect_url
    const loginUrl = redirectUrl 
      ? `/login?redirect_url=${encodeURIComponent(redirectUrl)}`
      : "/login"
    redirect({ href: loginUrl, locale })
  }
  let redirectUrl: string | undefined = undefined

  if (typeof searchParamsData?.redirect_url === "string" && searchParamsData.redirect_url.length > 0) {
    try {
      // Decode the redirect URL to check its actual path
      const decodedUrl = decodeURIComponent(searchParamsData.redirect_url)
      
      // Check if the redirect URL points to sign-in or sign-up pages (prevent loops)
      const isSignInPage = decodedUrl.includes("/sign-in") || decodedUrl.includes("/sign-up") || decodedUrl.includes("/login") || decodedUrl.includes("/signup")
      
      // Check if the URL contains a nested redirect_url parameter (indicates a redirect loop)
      const hasNestedRedirect = decodedUrl.includes("redirect_url=")
      
      if (!isSignInPage && !hasNestedRedirect) {
        // Validate that it's a relative path (starts with /)
        if (decodedUrl.startsWith("/")) {
          // Parse the URL to extract pathname and search params
          // Handle both absolute URLs and relative paths
          try {
            const urlObj = decodedUrl.startsWith("http")
              ? new URL(decodedUrl)
              : new URL(decodedUrl, "http://localhost")
            redirectUrl = urlObj.pathname + urlObj.search
          } catch {
            // If URL parsing fails, use the decoded URL as-is if it's a simple path
            redirectUrl = decodedUrl.split("?")[0] // Just use the path part
          }
        }
      }
      // If it's a sign-in/sign-up page or has nested redirects, redirectUrl remains undefined (will redirect to default)
    } catch (error) {
      // If decoding fails, ignore the redirect_url
      console.error("Failed to decode redirect_url:", error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <SignIn forceRedirectUrl={redirectUrl} />
    </div>
  )
}
