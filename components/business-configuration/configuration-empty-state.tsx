export function ConfigurationEmptyState() {
  return (
    <section className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
      <h2 className="text-lg font-semibold">Business Configuration is not set up yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        No draft or live release exists. Domain editing forms are introduced in later phases; nothing is activated automatically.
      </p>
    </section>
  )
}
