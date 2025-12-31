# Booking Status Explanation

## Status Definitions

### 1. **PENDING** (Orange Badge)
- **Meaning**: The booking has been created by the customer but payment has not been verified yet
- **When**: Customer completes checkout and creates a booking
- **Action Required**: Admin needs to verify payment and confirm the booking
- **Color**: 🟠 Orange

### 2. **CONFIRMED** (Green Badge)
- **Meaning**: Payment has been verified and the booking is approved. The rental period has NOT started yet.
- **When**: Admin verifies payment and confirms the booking
- **Status**: Booking is ready, but pickup date hasn't arrived
- **Color**: 🟢 Green

### 3. **IN_PROGRESS** (Blue Badge)
- **Meaning**: The rental period is currently active - customer has picked up the car
- **When**: Pickup date has arrived and car has been handed over
- **Status**: Customer is currently using the car
- **Color**: 🔵 Blue

### 4. **COMPLETED** (Emerald/Teal Badge)
- **Meaning**: The rental period has ended and the car has been returned successfully
- **When**: Drop-off date has passed and car has been returned
- **Status**: Booking is finished, all obligations fulfilled
- **Color**: 🟢 Emerald/Teal (darker green)

### 5. **CANCELLED** (Red Badge)
- **Meaning**: Booking was cancelled (by customer or admin) before completion
- **When**: Customer cancels or admin cancels due to issues
- **Status**: Booking terminated
- **Color**: 🔴 Red

### 6. **REJECTED** (Red Badge)
- **Meaning**: Booking was rejected by admin (e.g., payment failed, invalid information)
- **When**: Admin rejects the booking request
- **Status**: Booking denied
- **Color**: 🔴 Red

---

## Key Difference: CONFIRMED vs COMPLETED

### **CONFIRMED** (Green)
- ✅ Payment verified
- ✅ Booking approved by admin
- ⏳ **Waiting for pickup date**
- 📅 Rental period hasn't started yet
- 🚗 Car is reserved but not yet in customer's possession

**Example**: Booking confirmed on Jan 1st for pickup on Jan 10th → Status is **CONFIRMED** until Jan 10th

### **COMPLETED** (Emerald)
- ✅ Payment verified
- ✅ Booking was confirmed
- ✅ Pickup date passed (car was picked up)
- ✅ Drop-off date passed (car was returned)
- ✅ **Rental period is finished**
- 🏁 All obligations fulfilled

**Example**: Booking was from Jan 10th to Jan 15th → After Jan 15th, status becomes **COMPLETED**

---

## Status Flow

```
PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
   ↓           ↓
CANCELLED  REJECTED
```

1. Customer creates booking → **PENDING**
2. Admin verifies payment → **CONFIRMED**
3. Pickup date arrives → **IN_PROGRESS** (optional status)
4. Drop-off date passes → **COMPLETED**

Or at any point:
- Customer/Admin cancels → **CANCELLED**
- Admin rejects → **REJECTED**

