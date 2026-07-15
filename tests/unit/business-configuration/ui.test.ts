import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ConfigurationStatusBadge } from "@/components/business-configuration/configuration-status-badge"
import { ConfigurationEmptyState } from "@/components/business-configuration/configuration-empty-state"
import { CapabilityGuard } from "@/components/business-configuration/capability-guard"

describe("Business Configuration UI foundations", () => {
  it("renders plain-language health status", () => {
    expect(renderToStaticMarkup(createElement(ConfigurationStatusBadge, { status: "Action required" }))).toContain(
      "Action required",
    )
  })

  it("renders the no-configuration empty state without fake controls", () => {
    const markup = renderToStaticMarkup(createElement(ConfigurationEmptyState))
    expect(markup).toContain("not set up yet")
    expect(markup).not.toContain("Save")
  })

  it("does not render capability-controlled actions when denied", () => {
    const markup = renderToStaticMarkup(
      createElement(CapabilityGuard, { allowed: false }, createElement("button", null, "Activate")),
    )
    expect(markup).not.toContain("Activate")
  })
})
