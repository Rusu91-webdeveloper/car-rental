# Open Questions Requiring Client or Technical Approval

Reassessment: questions about rates, mixed-duration strategy, month/day definitions, grace/minimum charges, Vollkasko rules, driver requirements, required fields/documents, payments/deposits and confirmation content are administrator-entered Business Configuration values. They are no longer developer hard-coding blockers. They are independently drafted in cohesive domains and become live only through an atomic release manifest. Hard security/retention bounds, supported integrations, initial permissions and legal publication authority still require owner approval; see `06-rental-settings-architecture.md`.

The questions below remain useful as the choices the admin UI must explain. System-level decisions that cannot safely become dashboard settings are summarized at the end of the architecture proposal.

Phase 2A reduces schema-gate owner decisions to the option/consequence matrix in `08-phase-2-schema-proposal.md`, section 14. Most questions below remain future administrator choices, not schema blockers. The immediate Phase 2B blockers are the disposable PostgreSQL/replay strategy and approval of the exact hybrid schema, migration stages, database immutability approach, and optional overlap constraint. Storage/legal/payment/scanner decisions can safely defer table creation but block their respective runtime activation.

## Pricing and rental time

1. Does every vehicle have independently configured daily, weekly and monthly prices, and are any rates optional?
2. How are mixed durations priced—for example 10 days, 20 days, or one month plus five days? Possible policies produce different totals; none can be inferred safely.
3. Does “monthly” mean 28 days, 30 days, a calendar month, or same-day-of-next-month?
4. Does “weekly” always mean seven consecutive 24-hour periods or calendar dates?
5. Are pickup and return times part of chargeable-day calculation? What grace period, late-hour rounding, minimum rental, and timezone apply?
6. Are back-to-back bookings at the same return/pickup instant allowed, or is a cleaning/turnaround buffer required?
7. Are configured prices tax-inclusive? The current code applies a 10% fallback tax when the configured rate is zero; is that intentional for a German EUR rental business?
8. What rounding and rate-precedence rule applies, and must the calculation policy version be retained with each booking?

## Vollkasko

9. Is Vollkasko always exactly €10 per chargeable rental day for every vehicle and customer?
10. Is Vollkasko taxable, and is €10 gross or net?
11. May administrators change the insurance price or availability, and if so globally, per vehicle, or only prospectively?
12. What precisely is included/excluded and what deductible applies? Existing marketing says full/basic insurance is included, so which copy is legally correct?

## Terms, privacy and customer eligibility

13. Which languages must rental terms support? Is German authoritative if translations differ?
14. Who supplies and approves the legal rental terms and privacy wording?
15. Should terms be static release-managed content or publishable by administrators?
16. Must the exact accepted terms text be retained as an immutable snapshot, or are version, cryptographic hash and archived document sufficient?
17. Is acceptance an ordinary required checkbox only, with no PDF contract generation or electronic signature? The current requirement indicates yes, but legal confirmation is needed.
18. What privacy acknowledgement/consent is mandatory, which processing relies on contract/legal obligation/legitimate interest, and are any optional marketing consents needed?
19. Is date of birth required, or is declared/derived age sufficient? What minimum age and vehicle-specific eligibility rules apply?
20. Which driving-licence fields are required: number, issuing country, categories, issue/expiry dates, and additional drivers?
21. Does “country” mean residence, nationality, issuing country, billing country, or pickup country?

## Identity documents

22. Which storage provider and EU region should hold identity documents?
23. How long must each identity document and its metadata be retained, from which event, and what legal holds/deletion exceptions apply?
24. Who may view or download documents—customer, all admins, a restricted operations role, or external staff—and must every access be audited?
25. Is one file per document sufficient, or are front/back images required? Are PDF, JPEG and PNG acceptable, and what final size/count limits are approved?
26. Must uploads be complete before a booking is created, may a booking remain `DOCUMENTS_PENDING`, or are documents presented only at pickup?
27. Which malware scanning, OCR/redaction, identity verification or manual review provider—if any—is approved? OCR/automated verification must not be inferred from “upload.”
28. Must customers be able to replace/download/delete their documents, and how are GDPR access/erasure requests handled when retention obligations conflict?

## Payment and operations

29. Is payment online, offline, deposit-based, pay-at-pickup, or a supported combination? Stripe is currently disabled while transfer/pay-at-pickup are active.
30. What confirms a bank transfer, who marks it paid, and should the current `Payment` ledger represent manual transactions and refunds?
31. What booking expiry rule applies to pending transfers, and should email delivery failures be retried through an outbox/operations queue?
32. Is an administrator-created manual reservation a full booking with customer/consent data, or only an availability block? It currently stores name, phone and total inside `BlockedDate.reason` JSON.
