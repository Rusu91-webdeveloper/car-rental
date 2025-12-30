export function formatCurrency(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatCents(amountCents: number, currency = "EUR") {
  return formatCurrency(amountCents / 100, currency)
}
