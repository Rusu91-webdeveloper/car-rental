"use client"

import { useMemo, useState, type ReactNode } from "react"

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

  const goNext = () => setActiveIndex((prev) => (prev + 1) % total)
  const goPrev = () => setActiveIndex((prev) => (prev - 1 + total) % total)

  return (
    <div className="relative h-80 bg-gradient-to-b from-gray-100 to-gray-200">
      <img src={currentImage} alt={alt} className="w-full h-full object-cover" />

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-lg"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-lg"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1">
            {safeSlides.map((_, index) => (
              <button
                key={`dot-${index}`}
                type="button"
                aria-label={`Go to image ${index + 1}`}
                onClick={() => setActiveIndex(index)}
                className={`h-1 rounded-full transition-all ${
                  index === activeIndex ? "w-6 bg-background" : "w-1 bg-background/50"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {children}
    </div>
  )
}
