# Quick Start Guide - Manual Payment System

## ✅ System is Ready!

Your car rental website now supports **manual bank transfer payments** without requiring Stripe or online payment processing.

---

## 🎯 How It Works

### For Your Customers:
1. Customer selects a car and dates
2. Clicks "Book Now" → Fills in details → Clicks "Confirm Booking"
3. **Sees beautiful success modal** with:
   - Unique booking reference number
   - Transfer code for payment
   - Your bank details
   - Clear payment instructions
4. Receives **email with all details**
5. Makes bank transfer with transfer code
6. Receives confirmation email once you approve

### For You (Admin):
1. Receive **email notification** for every new booking
2. Check your bank account for incoming transfer
3. Match transfer code to booking
4. Go to `/admin` dashboard → Click "Confirm" on the booking
5. Customer automatically receives confirmation email

---

## 🔧 Setup Required (5 minutes)

### Step 1: Update Bank Details

Edit **TWO** files to add your real bank information:

#### File 1: `app/checkout/[id]/booking-success-modal.tsx`

Find around **line 150** and update:

```typescript
<p>Bank Name: <span className="font-medium">Your Bank Name</span></p>
<p>Account Name: <span className="font-medium">Car Rental Company</span></p>
<p>Account Number: <span className="font-medium">1234567890</span></p>
```

Change to your actual bank details:

```typescript
<p>Bank Name: <span className="font-medium">Chase Bank</span></p>
<p>Account Name: <span className="font-medium">ABC Car Rentals Inc</span></p>
<p>Account Number: <span className="font-medium">9876543210</span></p>
```

#### File 2: `lib/email.tsx`

Find the `sendManualPaymentEmail` function (around **line 90-95**) and update the same details:

```typescript
<p style="margin: 5px 0;"><strong>Bank Name:</strong> Your Bank Name</p>
<p style="margin: 5px 0;"><strong>Account Name:</strong> Car Rental Company</p>
<p style="margin: 5px 0;"><strong>Account Number:</strong> 1234567890</p>
<p style="margin: 5px 0;"><strong>Swift Code:</strong> YOURSWIFT</p>
```

---

### Step 2: Update Admin Email (Optional)

By default, booking notifications go to `admin@rentcar.com`.

To change this, edit `lib/config.ts`:

```typescript
adminEmails: ["your-email@yourdomain.com"],
```

You can add multiple emails:

```typescript
adminEmails: [
  "admin@yourdomain.com",
  "manager@yourdomain.com",
],
```

---

### Step 3: Set Up Email (Optional but Recommended)

For automated emails, you need an email service. **Resend** is recommended (free tier available).

1. Go to https://resend.com and create account
2. Get your API key
3. Add to `.env.local`:

```env
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM="Your Car Rental <noreply@yourdomain.com>"
```

**Without email setup**: System still works, but no automated emails are sent. You'll need to manually contact customers.

---

## 🧪 Test the System

1. Go to your website homepage
2. Click on any car
3. Click "Book Now"
4. Fill in dates and location
5. Click "Confirm Booking"
6. **You should see the success modal with bank details!**
7. Check your admin email for notification (if emails are set up)

---

## 📋 Daily Admin Workflow

### Morning Routine:
1. **Check Email** → Look for "New Booking" notifications
2. **Check Bank** → Look for transfers matching the transfer codes
3. **Update Dashboard** → Go to `/admin` and confirm paid bookings

### When Payment Arrives:
1. Open `/admin` in browser
2. Find the booking (look for PENDING status)
3. Verify transfer code matches
4. Click "Confirm" button
5. Done! Customer receives automatic confirmation

### If No Payment Received:
- Wait 24-48 hours
- Contact customer (their email is in admin panel)
- Or change booking status to "CANCELLED"

---

## 🎨 What Your Customer Sees

### Success Modal (After Booking):
```
┌─────────────────────────────────────┐
│  ✅ Booking Confirmed!              │
│                                     │
│  Booking Number: BK12345678         │
│  Transfer Code: A1B2C3D4            │
│                                     │
│  📋 Payment Instructions:           │
│  Bank Name: Your Bank               │
│  Account: 1234567890                │
│  Reference: A1B2C3D4                │
│                                     │
│  Total: $450.00                     │
│  Deposit: $90.00 (20%)              │
│                                     │
│  [View My Bookings]                 │
└─────────────────────────────────────┘
```

### Email They Receive:
- Professional branded email
- All booking details
- Payment instructions
- Transfer code highlighted
- Next steps clearly listed

---

## ❓ Common Questions

**Q: Do customers pay before or after booking?**  
A: Booking is created first, then they pay. You confirm once payment arrives.

**Q: What if customer doesn't pay?**  
A: Cancel the booking in admin dashboard. Car becomes available again.

**Q: Can they pay partial amount?**  
A: Yes! Show deposit amount (20% of total). They can pay rest later.

**Q: How do I know which payment is which?**  
A: Each booking has unique transfer code. Customer puts it in bank transfer reference.

**Q: Can I change the deposit percentage?**  
A: Yes! Edit `app/actions/bookings.ts` line ~48:
```typescript
const depositAmount = Math.round(totalPrice * 0.2) // Change 0.2 to 0.3 for 30%
```

**Q: What if I want online payments later?**  
A: Just add Stripe keys to `.env.local`. System automatically switches!

---

## 🚨 Important Notes

✅ **Always update BOTH files** with bank details (modal + email)  
✅ **Test booking flow** before launching  
✅ **Check admin dashboard works**  
✅ **Verify email notifications** (if using emails)  
✅ **Keep transfer codes confidential** - they're like passwords  

---

## 📚 Additional Resources

- **Full Documentation**: See `MANUAL_PAYMENT_SYSTEM.md`
- **Admin Dashboard**: Go to `/admin` to manage bookings
- **User Bookings**: Users see their bookings at `/bookings`
- **Profile**: Users can view profile at `/profile`

---

## ✅ You're All Set!

Your manual payment system is **fully implemented and ready to use**!

**Next Steps:**
1. ✅ Update bank details (2 files)
2. ✅ Update admin email
3. ✅ Test a booking
4. ✅ Launch your website!

**Need Help?**  
Check the full documentation in `MANUAL_PAYMENT_SYSTEM.md`

---

**System Status**: 🟢 **READY FOR PRODUCTION**  
**Created**: ${new Date().toLocaleDateString()}

