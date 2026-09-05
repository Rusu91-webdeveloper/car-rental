import { describe, expect, it } from "vitest"
import {
  replacementPredecessorId,
  selectLatestDocumentAttempts,
} from "@/lib/booking-applications/document-view"

describe("customer document attempt selection", () => {
  it("shows the newest replacement instead of the rejected current predecessor", () => {
    const documents = [
      { id: "rejected", documentTypeId: "licence", side: "SINGLE", slotNumber: 1, attemptNumber: 1 },
      { id: "replacement", documentTypeId: "licence", side: "SINGLE", slotNumber: 1, attemptNumber: 2 },
    ]

    expect(selectLatestDocumentAttempts(documents)).toEqual([documents[1]])
  })

  it("keeps independent document slots and sides", () => {
    const documents = [
      { id: "front", documentTypeId: "identity", side: "FRONT", slotNumber: 1, attemptNumber: 1 },
      { id: "back", documentTypeId: "identity", side: "BACK", slotNumber: 1, attemptNumber: 1 },
    ]

    expect(selectLatestDocumentAttempts(documents)).toEqual(documents)
  })

  it("keeps retrying against the current predecessor after a replacement is rejected", () => {
    expect(
      replacementPredecessorId({
        id: "rejected-replacement",
        replacesDocumentId: "current-predecessor",
      }),
    ).toBe("current-predecessor")
    expect(
      replacementPredecessorId({ id: "initial-rejected-document" }),
    ).toBe("initial-rejected-document")
  })
})
