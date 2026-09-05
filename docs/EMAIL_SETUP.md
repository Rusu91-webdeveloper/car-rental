# Gmail SMTP email configuration

Qujo sends all transactional messages through Gmail SMTP with Nodemailer. The same transport is used for contact messages, booking applications, document decisions, confirmations, cancellations, status changes, and production alert tests.

## Required production variables

```env
GMAIL_SMTP_USER=bookings@example.com
GMAIL_SMTP_APP_PASSWORD=abcdefghijklmnop
EMAIL_FROM="Qujo Autovermietung GmbH <bookings@example.com>"
```

- `GMAIL_SMTP_USER` is the dedicated Gmail or Google Workspace mailbox.
- `GMAIL_SMTP_APP_PASSWORD` is a 16-character Google App Password. Spaces are accepted and removed by the application. Never use the normal Google account password.
- `EMAIL_FROM` should use the authenticated mailbox or a Send As alias already verified in that Google account. Gmail may replace an unverified sender address.

Keep these variables server-only. Configure secrets in Vercel and local secrets in `.env.local`; never commit their values.

## Google account setup

1. Use a dedicated business mailbox, preferably Google Workspace.
2. Enable 2-Step Verification on the Google account.
3. Open Google Account → Security → App passwords.
4. Create an App Password named `Qujo production website`.
5. Store the generated password as `GMAIL_SMTP_APP_PASSWORD` in Vercel Production.
6. Set `GMAIL_SMTP_USER` and `EMAIL_FROM`, then redeploy.

App Passwords may be unavailable for accounts using Advanced Protection, security-key-only 2-Step Verification, or an organisation policy that disables them. In that case, use Gmail OAuth 2.0 or a transactional provider instead.

## Live verification

After deployment:

1. Sign in as an administrator.
2. Open `/de/admin/health`.
3. Select **Test-E-Mail versenden**.
4. Confirm the message arrived in the configured alert inbox.
5. Complete one synthetic booking and verify the customer and administrator messages.
6. Reject one synthetic document and verify the replacement-request email.
7. Check Gmail Sent Mail and Vercel runtime logs for rejected messages.

The health configuration check only confirms that credentials are present. Only the protected alert test proves that Gmail accepted a real message.

## Operational limits

Gmail SMTP is suitable for testing and low-volume operation, but Gmail is not a dedicated transactional email platform. Personal Gmail accounts normally have lower daily recipient limits than Google Workspace, may rewrite the From address, and may block connections that Google considers suspicious. Monitor delivery closely and move to a business transactional provider when volume or reliability requirements grow.

## Troubleshooting

- `534 5.7.90 Application-specific password required`: enable 2-Step Verification and use an App Password.
- `535 Username and Password not accepted`: verify the mailbox and App Password; generate a new App Password if the Google account password was changed.
- Message From address changed: use the authenticated mailbox or configure the address as a verified Gmail Send As alias.
- Connection timeout: check Vercel runtime logs and Google security activity; Gmail may reject unusual server locations.
- Daily limit exceeded: wait for the Gmail quota window to reset or use Google Workspace/a transactional provider.

## Privacy and business requirements

Customer and document-review emails may contain personal data. Use a business-controlled account, restrict mailbox access, enable 2-Step Verification, define retention rules, and put the required Google data-processing arrangements in place. Update the published Privacy Notice whenever the actual provider or processing terms change.

Official references:

- [Google App Passwords](https://support.google.com/accounts/answer/185833)
- [Nodemailer Gmail guide](https://nodemailer.com/guides/using-gmail)
- [Nodemailer SMTP transport](https://nodemailer.com/smtp)
