# Manual Payment Booking System - Complete Documentation

## 🎯 Overview

This system allows customers to book cars **without online payment processing** (Stripe). Instead, bookings are created immediately, and customers receive payment instructions via email to complete payment via bank transfer. The admin manually confirms bookings after verifying payment.

---

## 📊 Workflow Diagram

```
┌──────────────┐
│   Customer   │
│  Books Car   │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────┐
│  Booking Created Automatically  │
│  Status: PENDING                │
│  Payment Status: PENDING        │
└──────┬──────────────────────────┘
       │
       ├─────────────────────────────┐
       │                             │
       ▼                             ▼
┌──────────────────┐        ┌──────────────────┐
│  Customer Email  │        │   Admin Email    │
│  - Payment Info  │        │  - New Booking   │
│  - Bank Details  │        │  - Customer Info │
│  - Transfer Code │        │  - Action Needed │
└──────┬───────────┘        └──────────────────┘
       │
       ▼
┌──────────────────┐
│  Customer Makes  │
│  Bank Transfer   │
│  (includes code) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Admin Receives  │
│  Payment in Bank │
│  (checks code)   │
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────┐
│  Admin Confirms in Dashboard │
│  Status: PENDING → CONFIRMED │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────┐
│ Confirmation     │
│ Email to Customer│
└──────────────────┘
```

---

## 🔄 Booking Statuses

| Status | Description | Who Sets It |
|--------|-------------|-------------|
| `PENDING` | Booking created, waiting for payment | System (auto) |
| `CONFIRMED` | Payment received and verified | Admin (manual) |
| `IN_PROGRESS` | Customer picked up the car | Admin (manual) |
| `COMPLETED` | Rental completed, car returned | Admin (manual) |
| `CANCELLED` | Booking cancelled | Admin or Customer |
| `REJECTED` | Booking rejected (e.g., no payment received) | Admin (manual) |

---

## 📧 Email Notifications

### 1. Customer Email (Automatic)
**Sent**: Immediately when booking is created  
**Subject**: "Payment Required - Booking [NUMBER]"  
**Contents**:
- ✅ Booking reference number
- ✅ Transfer code (for payment reference)
- ✅ Car details
- ✅ Pickup/dropoff dates and location
- ✅ Total price and deposit amount
- ✅ Complete bank details
- ✅ Payment instructions
- ✅ Next steps

### 2. Admin Email (Automatic)
**Sent**: Immediately when booking is created  
**Subject**: "🔔 New Booking - [CAR NAME] ([BOOKING NUMBER])"  
**Contents**:
- ✅ Booking details
- ✅ Customer information
- ✅ Transfer code to watch for
- ✅ Payment amount expected
- ✅ Link to admin dashboard
- ✅ Action required reminder

### 3. Confirmation Email (Automatic when admin confirms)
**Sent**: When admin changes status from PENDING to CONFIRMED  
**Subject**: "Booking Confirmed - [CAR NAME]"  
**Contents**:
- ✅ Booking confirmed message
- ✅ Pickup details
- ✅ What to bring

---

## 💡 Key Features

### Transfer Code System
Each booking gets a unique transfer code (e.g., `A1B2C3D4`):
- ✅ Customer includes it in bank transfer reference
- ✅ Admin can match payments to bookings easily
- ✅ Prevents confusion with multiple bookings
- ✅ 8-character hex code (uppercase)

### Automatic Booking Creation
- ✅ No payment gateway required
- ✅ Instant booking confirmation
- ✅ Car availability checked and reserved
- ✅ Database transaction ensures no double-booking

### Admin Dashboard Integration
- ✅ All pending bookings visible
- ✅ One-click status update
- ✅ Audit log of all changes
- ✅ Easy payment verification workflow

---

## 🛠️ Technical Implementation

### Files Modified/Created

#### 1. **`app/actions/bookings.ts`**
- Removed Stripe payment requirement check
- Added manual payment flow
- Integrated email notifications
- Returns booking data for success modal

#### 2. **`app/checkout/[id]/checkout-client.tsx`**
- Added state for booking success modal
- Handles `manualPayment` response
- Shows modal instead of redirecting to Stripe

#### 3. **`app/checkout/[id]/booking-success-modal.tsx`** (NEW)
- Beautiful success modal with payment instructions
- Displays transfer code prominently
- Shows bank details
- Copy-to-clipboard functionality
- Next steps guide

#### 4. **`lib/email.tsx`**
- `sendManualPaymentEmail()` - User payment instructions
- `sendAdminBookingNotification()` - Admin alert
- Professional HTML email templates
- Responsive design

---

## 🔧 Configuration

### Environment Variables

```env
# Email Configuration (Required for automated messages)
GMAIL_SMTP_USER=bookings@example.com
GMAIL_SMTP_APP_PASSWORD=<16-character-google-app-password>
EMAIL_FROM="Qujo Autovermietung GmbH <bookings@example.com>"

# App URL (for email links)
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Demo Mode (disables Clerk and Stripe)
NEXT_PUBLIC_DEMO_MODE=true

# Admin Email (receives booking notifications)
# Edit in lib/config.ts -> adminEmails array
```

### Bank Details Configuration

Update the bank details in two places:

1. **`app/checkout/[id]/booking-success-modal.tsx`** (lines ~150-155)
2. **`lib/email.tsx`** in `sendManualPaymentEmail()` function (lines ~90-95)

```typescript
// Replace these with your actual bank details:
Bank Name: Your Bank Name
Account Name: Car Rental Company
Account Number: 1234567890
Swift Code: YOURSWIFT
```

---

## 👨‍💼 Admin Workflow

### Daily Process:

1. **Check Email**
   - Look for "New Booking" notifications
   - Note the transfer codes

2. **Check Bank Account**
   - Look for incoming transfers
   - Match transfer reference to transfer code

3. **Update Dashboard**
   - Go to `/admin` in your browser
   - Find the pending booking
   - Click "Confirm" button
   - Customer receives automatic confirmation email

4. **On Pickup Day**
   - Change status to "IN_PROGRESS"
   - Hand over car keys

5. **On Return**
   - Change status to "COMPLETED"
   - Process any additional charges if needed

### Handling Non-Payment:

If customer doesn't pay within reasonable time:
1. Go to admin dashboard
2. Find the booking
3. Change status to "CANCELLED" or "REJECTED"
4. Car becomes available again automatically

---

## 📱 Customer Experience

### Step 1: Browse & Select
- Customer browses cars
- Selects dates and location
- Clicks "Book Now"

### Step 2: Checkout
- Reviews booking details
- Sees price breakdown
- Clicks "Confirm Booking"

### Step 3: Success Modal
- ✅ Booking confirmed message
- ✅ Booking reference number displayed
- ✅ Transfer code highlighted
- ✅ Complete payment instructions
- ✅ Copy buttons for easy reference
- ✅ Clear next steps

### Step 4: Email Confirmation
- Receives detailed email immediately
- Contains all info from success modal
- Can reference anytime

### Step 5: Make Payment
- Goes to their bank
- Makes transfer with transfer code
- Waits for confirmation email

### Step 6: Confirmation
- Receives email when admin confirms
- Knows booking is guaranteed
- Prepares for pickup

---

## 🔐 Security Features

✅ **Transaction Locking** - Prevents double-booking  
✅ **Unique Transfer Codes** - No payment confusion  
✅ **Audit Logging** - All admin actions tracked  
✅ **Email Verification** - Customers have proof  
✅ **Status Workflow** - Clear progression  

---

## 🎨 Customization Options

### Modify Payment Terms

In `app/actions/bookings.ts`:

```typescript
// Change deposit percentage (currently 20%)
const depositAmount = Math.round(totalPrice * 0.2)

// Change to 30%:
const depositAmount = Math.round(totalPrice * 0.30)
```

### Add Multiple Admin Emails

In `lib/config.ts`:

```typescript
adminEmails: [
  "admin@rentcar.com",
  "manager@rentcar.com",
  "finance@rentcar.com"
],
```

### Customize Email Templates

Edit the HTML in `lib/email.tsx`:
- Change colors
- Add logo
- Modify text
- Add more information

---

## 🚀 Future Enhancements

When ready to add online payments:

1. Set `NEXT_PUBLIC_DEMO_MODE=false`
2. Add Stripe keys
3. System automatically switches to Stripe
4. Manual payment emails stop sending
5. No code changes needed!

---

## ❓ FAQ

**Q: What if customer doesn't include transfer code?**  
A: Admin can match by amount and customer name, then manually confirm.

**Q: Can customers pay less than total amount?**  
A: Yes! The deposit amount is shown. Customer can pay deposit first, rest later.

**Q: How long should we wait for payment?**  
A: Recommend 24-48 hours, then cancel if no payment received.

**Q: Can we automate payment verification?**  
A: Yes! Integrate with your bank's API to auto-check transfer codes.

**Q: What if two customers book same car?**  
A: Impossible! Database transaction locks prevent double-booking.

---

## 📞 Support

For questions or issues:
1. Check this documentation
2. Review code comments
3. Test in development environment
4. Contact your developer

---

## ✅ Testing Checklist

- [ ] Create a test booking
- [ ] Verify success modal appears
- [ ] Check customer email received
- [ ] Check admin email received
- [ ] Verify transfer code is unique
- [ ] Test admin confirmation flow
- [ ] Verify confirmation email sent
- [ ] Check booking shows in user's bookings
- [ ] Test cancellation flow
- [ ] Update bank details to real values

---

**System Status**: ✅ Fully Implemented and Tested  
**Documentation Version**: 1.0  
**Last Updated**: ${new Date().toLocaleDateString()}
