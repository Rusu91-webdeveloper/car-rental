import { LoaderCircle, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getLocale } from "next-intl/server"

export default async function Loading() {
  const de = (await getLocale()) === "de"

  return (
    <main
      className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center p-4 sm:p-6 lg:p-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-2xl space-y-4">
        <Card className="overflow-hidden border-primary/20 bg-background shadow-lg shadow-primary/5">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" aria-hidden="true" />
              <span className="absolute -inset-1 rounded-[1.15rem] border-2 border-primary/20 border-t-primary motion-safe:animate-spin" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-tight">{de ? "Ihre Seite wird geöffnet" : "Opening your page"}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {de ? "Wir speichern Ihren Fortschritt und bereiten den nächsten Schritt vor." : "We’re saving your progress and getting the next step ready."}
            </p>
            <div className="mt-6 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-primary/10">
              <div className="h-full w-1/2 rounded-full bg-primary motion-safe:animate-pulse" />
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <LoaderCircle className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
              {de ? "Bitte warten Sie einen Moment" : "Please wait a moment"}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-xl border bg-background p-4">
              <div className="h-3 w-20 rounded-full bg-muted motion-safe:animate-pulse" />
              <div className="mt-3 h-6 w-12 rounded-full bg-muted motion-safe:animate-pulse" />
              <div className="mt-3 h-2 w-full rounded-full bg-muted/70 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
