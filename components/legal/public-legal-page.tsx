import type React from "react"
import { PublicPageHeader } from "@/components/public-page-header"

export interface PublicLegalSection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  content?: React.ReactNode
}

export function PublicLegalPage({ title, intro, updated, sections }: { title: string; intro: string; updated: string; sections: PublicLegalSection[] }) {
  return (
    <div className="qujo-page">
      <PublicPageHeader title={title} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">{intro}</p>
        <p className="mt-3 text-sm text-muted-foreground">{updated}</p>
        <article className="qujo-panel mt-10 divide-y divide-border/70 p-6 sm:p-10">
          {sections.map((section, index) => (
            <section key={`${index}-${section.title}`} className="py-7 first:pt-0 last:pb-0">
              <h2 className="text-xl font-semibold sm:text-2xl">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-4 leading-7 text-muted-foreground">{paragraph}</p>)}
              {section.bullets?.length ? <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-muted-foreground">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {section.content ? <div className="mt-4 leading-7 text-muted-foreground">{section.content}</div> : null}
            </section>
          ))}
        </article>
      </main>
    </div>
  )
}
