# Booking-confirmation and payment-instruction audit

## Decision

The existing notification architecture is sufficient and remains the only email path.

- `lib/email.tsx` is the consolidated delivery service for SMTP and Resend.
- `app/actions/bookings.ts` already sends the customer confirmation when an administrator transitions a booking to `CONFIRMED`.
- The booking-application flow already snapshots `PaymentConfigVersion`, `ConfirmationConfigVersion`, the selected configured payment mode, and the selected localized instruction.
- No outbox, second email provider wrapper, parallel notification service, or confirmation email at application finalization was added.

The confirmed-status handler now resolves the immutable configuration captured by the source booking application and passes it to `sendBookingConfirmationEmail`. Repeating `CONFIRMED` for an already-confirmed booking does not send the confirmation again.

## Supported payment instructions

The existing configured payment modes are used as follows:

| Customer-facing option | Existing configured mode | Behavior |
| --- | --- | --- |
| Invoice | `BOOKING_REQUEST` | Sends configured invoice/invoicing instructions. |
| Bank Transfer | `BANK_TRANSFER` | Sends configured bank-transfer instructions. |
| Cash at Pickup | `CASH_ON_PICKUP` | Sends configured cash-at-pickup instructions. |

Instructions are localized and keyed by payment method. Legacy rows are migrated to their payment version's default method. The Payment section in `ConfirmationConfigVersion` controls whether the selected instruction is rendered, while localized confirmation heading/content comes from `ConfirmationContentTranslation`. Configured text is HTML-escaped before email rendering.

Administrators edit future versions through the existing Business Configuration pages for Payments and Confirmations. Edits create or reuse versioned drafts, attach them to the existing draft release, preserve optimistic revision checks and audit events, and require normal release validation/activation before becoming live.

## Explicit exclusions

This change does not implement or expose:

- online payment processing;
- card or online payment methods in the editor;
- payment gateways or provider SDKs;
- payment intents, sessions, webhooks, transaction tracking, reconciliation, or settlement;
- automatic invoice generation or delivery of invoice files.

Existing legacy Stripe fields and unrelated historical payment code are not expanded by this work.
