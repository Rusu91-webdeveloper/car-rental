"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"

export function CarImageCarousel({
  images,
  alt,
  children,
}: {
  images: string[]
  alt: string
  children?: ReactNode
}) {
  const slides = useMemo(() => images.filter(Boolean), [images])
  const safeSlides = slides.length > 0 ? slides : ["/placeholder.svg"]
  const [activeIndex, setActiveIndex] = useState(0)
  const total = safeSlides.length
  const currentImage = safeSlides[activeIndex]

  useEffect(() => {
    setActiveIndex((prev) => (prev >= total ? 0 : prev))
  }, [total])

  const goNext = () => setActiveIndex((prev) => (prev + 1) % total)
  const goPrev = () => setActiveIndex((prev) => (prev - 1 + total) % total)

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-muted/60 shadow-lg">
        <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-[16/9] xl:aspect-[21/10]">
          <img
            src={currentImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20" />
          <img
            src={currentImage}
            alt={alt}
            className="relative z-10 h-full w-full object-contain p-2 sm:p-3 md:p-4"
          />

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-background/90 p-2 text-foreground shadow-lg transition hover:bg-background"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next image"
                className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-background/90 p-2 text-foreground shadow-lg transition hover:bg-background"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs font-medium shadow-sm">
                {activeIndex + 1} / {total}
              </div>
            </>
          )}

          {children}
        </div>
      </div>

      {total > 1 && (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-full gap-2 sm:gap-3">
            {safeSlides.map((image, index) => {
              const isActive = index === activeIndex
              return (
                <button
                  key={`thumb-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show image ${index + 1}`}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border transition sm:h-20 sm:w-32 ${
                    isActive
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border/80 opacity-80 hover:opacity-100"
                  }`}
                >
                  <img src={image} alt={`${alt} ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
