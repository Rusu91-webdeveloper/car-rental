"use client"

import { useState, useTransition } from "react"
import { createBookingReview } from "@/app/actions/reviews"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

type BookingReview = {
  id: string
  rating: number
  comment: string
  createdAt: string
}

interface BookingReviewSectionProps {
  bookingId: string
  locale: string
  canLeaveReview: boolean
  existingReview: BookingReview | null
  copy: {
    yourReview: string
    rateExperience: string
    eligibleMessage: string
    leaveReview: string
    submitReview: string
    submitting: string
    cancel: string
    placeholder: string
  }
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-5 w-5 ${filled ? "text-amber-500" : "text-gray-300"}`}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path d="M12 17.27L18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  )
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <StarIcon key={value} filled={value <= rating} />
      ))}
    </div>
  )
}

export function BookingReviewSection({ bookingId, locale, canLeaveReview, existingReview, copy }: BookingReviewSectionProps) {
  const { toast } = useToast()
  const [review, setReview] = useState<BookingReview | null>(existingReview)
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()

  if (!review && !canLeaveReview) {
    return null
  }

  const handleSubmit = () => {
    if (rating < 1 || rating > 5) {
      toast({
        title: "Invalid rating",
        description: "Please choose a star rating from 1 to 5.",
        variant: "destructive",
      })
      return
    }

    if (comment.trim().length < 5) {
      toast({
        title: "Comment too short",
        description: "Please add at least 5 characters.",
        variant: "destructive",
      })
      return
    }

    startTransition(async () => {
      const result = await createBookingReview({
        bookingId,
        rating,
        comment: comment.trim(),
      })

      if (result?.error) {
        toast({
          title: "Review not saved",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result?.success && result.review) {
        setReview(result.review)
        setShowForm(false)
        setComment("")
        toast({
          title: "Review submitted",
          description: "Thanks for sharing your experience.",
        })
      }
    })
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h4 className="mb-2 text-sm font-semibold">{review ? copy.yourReview : copy.rateExperience}</h4>

      {review ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <StarDisplay rating={review.rating} />
            <span className="text-xs text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <p className="text-sm text-foreground/90">{review.comment}</p>
        </div>
      ) : showForm ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className="rounded-sm p-1 transition hover:scale-105"
                aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
              >
                <StarIcon filled={value <= rating} />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={copy.placeholder}
            rows={4}
          />
          <div className="flex items-center gap-2">
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending ? copy.submitting : copy.submitReview}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowForm(false)
                setComment("")
                setRating(5)
              }}
              disabled={isPending}
            >
              {copy.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
          <p className="mb-3 text-muted-foreground">{copy.eligibleMessage}</p>
          <Button type="button" variant="outline" onClick={() => setShowForm(true)}>
            {copy.leaveReview}
          </Button>
        </div>
      )}
    </div>
  )
}
