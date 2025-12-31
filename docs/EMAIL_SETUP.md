# Email Configuration Guide

This document explains how email sending is configured in the car rental app using SMTP with nodemailer.

## 📧 Email Provider Setup

The app supports **SMTP with nodemailer** as the primary email provider, with Resend as a fallback option.

### SMTP Configuration (Recommended)

Add these environment variables to your `.env.local` file:

```env
# SMTP Configuration
EMAIL_HOST=smtp.gmail.com              # Your SMTP server host
EMAIL_PORT=587                         # SMTP port (587 for TLS, 465 for SSL)
EMAIL_USER=your-email@gmail.com         # SMTP username (usually your email)
EMAIL_PASS=your-app-password            # SMTP password or app-specific password
EMAIL_FROM="Car Rental <noreply@yourdomain.com>"  # Sender name and email
```

### Common SMTP Providers

#### Gmail
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password  # Use App Password, not regular password
EMAIL_FROM="Car Rental <your-email@gmail.com>"
```

**Note:** For Gmail, you need to:
1. Enable 2-factor authentication
2. Generate an "App Password" from your Google Account settings
3. Use the app password (not your regular password)

#### Outlook/Hotmail
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
EMAIL_FROM="Car Rental <your-email@outlook.com>"
```

#### Custom SMTP Server
```env
EMAIL_HOST=smtp.yourdomain.com
EMAIL_PORT=587
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=your-smtp-password
EMAIL_FROM="Car Rental <noreply@yourdomain.com>"
```

### Fallback: Resend (Optional)

If SMTP is not configured, the app will fall back to Resend:

```env
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM="Car Rental <noreply@yourdomain.com>"
```

## 📬 Email Flow

### 1. **On Booking Creation**

When a customer creates a booking:

- **User Email**: Receives `sendManualPaymentEmail` with:
  - Booking details
  - Payment instructions
  - Bank transfer details
  - Transfer reference code
  - Deadline for payment

- **Admin Email**: Receives `sendAdminBookingNotification` with:
  - New booking alert
  - Customer information
  - Booking details
  - Transfer reference code
  - Payment amount
  - Link to admin dashboard

### 2. **On Booking Confirmation**

When an admin confirms a booking (status changed to "CONFIRMED"):

- **User Email**: Receives `sendBookingConfirmationEmail` with:
  - Confirmation message
  - Complete booking details
  - Transfer code for pickup
  - Pickup instructions
  - Next steps

- **Admin Email**: Receives `sendAdminBookingConfirmationNotification` with:
  - Confirmation notification
  - Booking details
  - Customer information
  - Pickup date reminder
  - Link to booking details

### 3. **On Booking Status Changes**

For other status changes (CANCELLED, REJECTED):

- **User Email**: Receives `sendBookingStatusEmail` with status update

## 🔧 Configuration Files

### Email Functions Location
- **File**: `lib/email.tsx`
- **Functions**:
  - `sendEmail()` - Core email sending function
  - `sendManualPaymentEmail()` - Payment instructions to user
  - `sendBookingConfirmationEmail()` - Detailed confirmation to user
  - `sendBookingStatusEmail()` - Status updates to user
  - `sendAdminBookingNotification()` - New booking alert to admin
  - `sendAdminBookingConfirmationNotification()` - Confirmation alert to admin

### Booking Actions Location
- **File**: `app/actions/bookings.ts`
- **Functions**:
  - `createBooking()` - Sends emails on booking creation
  - `updateBookingStatus()` - Sends emails on status changes

## ✅ Email Configuration Check

The app automatically detects if email is configured:

```typescript
// From lib/config.ts
emailEnabled: smtpEnabled || !!process.env.RESEND_API_KEY
```

Where `smtpEnabled` checks for:
- `EMAIL_HOST`
- `EMAIL_USER`
- `EMAIL_PASS`

## 🧪 Testing Email Configuration

1. **Check Configuration**:
   - Ensure all SMTP variables are set in `.env.local`
   - Restart your development server after adding variables

2. **Test Email Sending**:
   - Create a test booking
   - Check console logs for email sending status
   - Look for `[EMAIL]` log messages

3. **Verify Emails**:
   - Check user's inbox for booking confirmation
   - Check admin email for notifications
   - Check spam folder if emails don't arrive

## 🐛 Troubleshooting

### Emails Not Sending

1. **Check Environment Variables**:
   ```bash
   # Verify variables are loaded
   echo $EMAIL_HOST
   echo $EMAIL_USER
   ```

2. **Check SMTP Credentials**:
   - Verify username and password are correct
   - For Gmail, ensure you're using an App Password
   - Check if your email provider requires special settings

3. **Check Port Settings**:
   - Port 587: TLS (most common)
   - Port 465: SSL
   - Ensure firewall allows outbound connections on these ports

4. **Check Console Logs**:
   - Look for `[EMAIL_ERROR]` messages
   - Check for SMTP authentication errors
   - Verify email addresses are valid

### Common Errors

**"Email provider not configured"**
- Solution: Add SMTP credentials or Resend API key

**"Authentication failed"**
- Solution: Check EMAIL_USER and EMAIL_PASS are correct
- For Gmail: Use App Password, not regular password

**"Connection timeout"**
- Solution: Check EMAIL_HOST and EMAIL_PORT are correct
- Verify firewall/network allows SMTP connections

## 📝 Admin Email Configuration

Admin emails are configured via:

1. **Environment Variables**:
   ```env
   ADMIN_EMAILS=admin@yourdomain.com,manager@yourdomain.com
   # or
   ADMIN_EMAIL=admin@yourdomain.com
   ```

2. **Company Settings** (Database):
   - Set `adminEmail` in company settings via admin panel
   - This is used as a fallback if env vars are not set

3. **Default**:
   - If no admin emails are configured, defaults to `admin@rentcar.com`

## 🔒 Security Notes

- **Never commit** `.env.local` to version control
- Use **App Passwords** for Gmail (not regular passwords)
- Keep SMTP credentials secure
- Consider using environment-specific email addresses for testing

## 📚 Additional Resources

- [Nodemailer Documentation](https://nodemailer.com/about/)
- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [Resend Documentation](https://resend.com/docs)

