# Legal and contact launch checklist

This checklist is a release gate for the public footer pages and contact workflow. The code deliberately does not publish invented company details.

## 1. Registered company data

In **Admin → Business settings → Business details**, enter the exact current data from the commercial register:

- Qujo Autovermietung GmbH as registered name
- service address (street, postal code, city, country)
- public email address and a directly reachable phone number
- managing director
- register court and commercial register number
- VAT identification number, if issued
- editorially responsible person only if the website contains journalistic-editorial content

Do not deploy while the Impressum omits the address, email, phone, managing director, register court, or register number.

## 2. Contact email delivery

Configure all of the following in the production environment:

- `GMAIL_SMTP_USER` using a dedicated business-controlled Gmail or Google Workspace mailbox
- `GMAIL_SMTP_APP_PASSWORD` using a 16-character Google App Password, never the normal account password
- `EMAIL_FROM` using the authenticated mailbox or a verified Gmail Send As alias
- `ADMIN_EMAILS` and/or the owner notification email in **Admin → Customer messages**
- `RATE_LIMIT_HASH_SECRET` with a unique random value of at least 32 characters

The contact form validates input on the server, uses a honeypot, applies shared database rate limits, sends through Gmail SMTP, and sets the visitor address as `Reply-To`. Perform a live smoke test from the deployed Contact page and confirm receipt and reply routing before launch.

## 3. Legal documents used at checkout

The public pages provide a researched baseline, but checkout uses separately versioned, immutable legal documents. In **Admin → Legal terms and privacy**:

1. paste the final German and English Rental Terms and Privacy Notice;
2. have the wording reviewed for Qujo's actual fleet, insurance, deposit, mileage, fuel/charging, cancellation, damage and payment model;
3. validate and publish both documents;
4. attach the exact published versions to the active booking configuration;
5. complete a test booking and open both versioned links from the checkout and confirmation.

## 4. Processor and privacy configuration

- execute data-processing agreements with hosting, database, private storage and email providers;
- configure private customer-document storage in the approved EU region and complete the repository's production attestation;
- review Google OAuth scopes and provider disclosures if Google sign-in is enabled;
- keep marketing/profiling cookies disabled unless a compliant consent manager is implemented;
- update the Privacy Notice before adding a provider or materially changing retention or processing.

## 5. Final legal review

German consumer and rental law depends on the actual commercial model. A German lawyer should approve the final public wording and the versioned checkout documents before accepting live bookings. Record the approval date and the approved document version in the release evidence.
