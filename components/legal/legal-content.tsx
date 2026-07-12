export function LegalContent({ content }: { content: string }) {
  const paragraphs = content.trim().split(/\n{2,}/)
  return <div className="space-y-4 text-sm leading-7">{paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</div>
}
