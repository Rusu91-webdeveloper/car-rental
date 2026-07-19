import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Phase6DraftLiveComparison } from "@/components/business-configuration/phase6-draft-live-comparison"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("Phase 6 focused UI contracts", () => {
  it("uses plain-language insurance controls and moves uncommon choices under Advanced", () => {
    const insurance = source("components/business-configuration/insurance-configuration-form.tsx")
    expect(insurance).toContain("Offer full-cover insurance")
    expect(insurance).toContain("Optional — customer chooses")
    expect(insurance).toContain("Advanced")
    expect(insurance).toContain("Example customer price")
  })

  it("shows eligibility examples, dependency reasons, unavailable workflow steps, and read-only states", () => {
    expect(source("components/business-configuration/driver-requirements-form.tsx")).toContain("Would this example driver be allowed?")
    expect(source("components/business-configuration/customer-field-requirement-table.tsx")).toContain("Why")
    expect(source("components/business-configuration/booking-flow-step-list.tsx")).toContain("This step is not available yet")
    expect(source("components/business-configuration/customer-field-requirement-table.tsx")).toContain("View-only access")
  })

  it("renders explicit live and draft versions without implying activation", () => {
    const live = { id: "live", versionNumber: 1, revision: 1, status: "RELEASED", validationStatus: "VALID", changeSummary: "Live", updatedAt: "2030-01-01", updatedBy: "Admin", configuration: { enabled: false } }
    const draft = { ...live, id: "draft", versionNumber: 2, status: "DRAFT", configuration: { enabled: true } }
    const markup = renderToStaticMarkup(createElement(Phase6DraftLiveComparison, { live, draft, impact: "Future bookings change." }))
    expect(markup).toContain("Live:")
    expect(markup).toContain("Version 2")
    expect(markup).toContain("future bookings only")
  })
})
