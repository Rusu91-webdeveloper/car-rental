export interface DocumentAttemptView {
  documentTypeId: string
  side: string
  slotNumber: number | null
  attemptNumber: number | null
}

export function selectLatestDocumentAttempts<T extends DocumentAttemptView>(documents: T[]): T[] {
  const latestBySlot = new Map<string, T>()

  for (const document of documents) {
    const key = `${document.documentTypeId}:${document.slotNumber ?? 0}:${document.side}`
    const current = latestBySlot.get(key)
    if (!current || (document.attemptNumber ?? 0) > (current.attemptNumber ?? 0)) {
      latestBySlot.set(key, document)
    }
  }

  return [...latestBySlot.values()]
}
