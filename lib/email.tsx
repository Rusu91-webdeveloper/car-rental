import { Resend } from "resend"
import { formatCents } from "@/lib/money"

const resend = new Resend(process.env.RESEND_API_KEY)

interface BookingEmailData {
  to: string
  userName: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  transferCode: string
  bookingNumber: string
}

export async function sendBookingConfirmationEmail(data: BookingEmailData) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "RentCar <noreply@rentcar.com>",
      to: data.to,
      subject: `Booking Confirmed - ${data.carName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0066FF; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .transfer-code { background: #fff; border: 2px dashed #0066FF; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; border-radius: 4px; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚗 Booking Confirmed!</h1>
              </div>
              <div class="content">
                <p>Hi ${data.userName},</p>
                <p>Great news! Your booking has been confirmed. Here are your booking details:</p>
                
                <div class="transfer-code">
                  Transfer Code: ${data.transferCode}
                </div>
                <p style="text-align: center; color: #666; font-size: 14px;">Please show this code when picking up your vehicle</p>
                
                <div class="details">
                  <div class="detail-row">
                    <span><strong>Booking Number:</strong></span>
                    <span>${data.bookingNumber}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Vehicle:</strong></span>
                    <span>${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Pick-up:</strong></span>
                    <span>${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Drop-off:</strong></span>
                    <span>${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Location:</strong></span>
                    <span>${data.location}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Total Price:</strong></span>
                    <span style="color: #0066FF; font-weight: bold;">${formatCents(data.totalPrice)}</span>
                  </div>
                </div>
                
                <p><strong>Next Steps:</strong></p>
                <ul>
                  <li>Save your transfer code (${data.transferCode})</li>
                  <li>Bring a valid driver's license</li>
                  <li>Arrive at the pickup location 15 minutes early</li>
                </ul>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@rentcar.com</p>
                <p>&copy; ${new Date().getFullYear()} RentCar. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    console.log("[EMAIL] Booking confirmation sent to:", data.to)
    return { success: true }
  } catch (error) {
    console.error("[EMAIL_ERROR]", error)
    return { error: "Failed to send email" }
  }
}

export async function sendBookingStatusEmail(
  to: string,
  userName: string,
  carName: string,
  status: string,
  bookingNumber: string,
) {
  try {
    let subject = ""
    let message = ""

    switch (status) {
      case "CONFIRMED":
        subject = `Booking Confirmed - ${carName}`
        message = "Your booking has been confirmed by our team. You're all set!"
        break
      case "CANCELLED":
        subject = `Booking Cancelled - ${carName}`
        message = "Your booking has been cancelled. If you have any questions, please contact support."
        break
      case "REJECTED":
        subject = `Booking Update - ${carName}`
        message =
          "Unfortunately, we cannot process your booking at this time. Please contact support for more information."
        break
      default:
        return { success: true }
    }

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "RentCar <noreply@rentcar.com>",
      to,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Booking Status Update</h2>
              <p>Hi ${userName},</p>
              <p>${message}</p>
              <p><strong>Booking Number:</strong> ${bookingNumber}</p>
              <p><strong>Vehicle:</strong> ${carName}</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px;">Questions? Contact us at support@rentcar.com</p>
            </div>
          </body>
        </html>
      `,
    })

    console.log("[EMAIL] Status update sent to:", to)
    return { success: true }
  } catch (error) {
    console.error("[EMAIL_ERROR]", error)
    return { error: "Failed to send email" }
  }
}

// Manual Payment Email for Users
export async function sendManualPaymentEmail(data: {
  to: string
  userName: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  depositAmount: number
  transferCode: string
  bookingNumber: string
}) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "RentCar <noreply@rentcar.com>",
      to: data.to,
      subject: `Payment Required - Booking ${data.bookingNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0066FF; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .transfer-code { background: #fff; border: 2px solid #0066FF; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; border-radius: 4px; letter-spacing: 2px; }
              .payment-box { background: #FFF9E6; border: 2px solid #FFB800; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .bank-details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #0066FF; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
              .highlight { color: #0066FF; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✅ Booking Created Successfully!</h1>
              </div>
              <div class="content">
                <p>Hi ${data.userName},</p>
                <p>Your booking request has been received. To complete your reservation, please make the payment using the details below:</p>
                
                <div class="transfer-code">
                  ${data.transferCode}
                </div>
                <p style="text-align: center; color: #666; font-size: 14px;"><strong>Important:</strong> Use this code as your payment reference</p>
                
                <div class="payment-box">
                  <h3 style="margin-top: 0; color: #B37400;">⚠️ Payment Required</h3>
                  <p style="margin-bottom: 15px;">Please complete payment via bank transfer to confirm your booking:</p>
                  
                  <div style="background: white; padding: 15px; border-radius: 4px; margin: 15px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                      <span>Deposit (20%):</span>
                      <strong>${formatCents(data.depositAmount)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 18px;">
                      <span><strong>Total Amount:</strong></span>
                      <strong style="color: #0066FF;">${formatCents(data.totalPrice)}</strong>
                    </div>
                  </div>

                  <div class="bank-details">
                    <h4 style="margin-top: 0;">Bank Transfer Details:</h4>
                    <p style="margin: 5px 0;"><strong>Bank Name:</strong> Your Bank Name</p>
                    <p style="margin: 5px 0;"><strong>Account Name:</strong> Car Rental Company</p>
                    <p style="margin: 5px 0;"><strong>Account Number:</strong> 1234567890</p>
                    <p style="margin: 5px 0;"><strong>Swift Code:</strong> YOURSWIFT</p>
                    <p style="margin: 15px 0 5px 0; padding-top: 10px; border-top: 1px solid #eee;"><strong>Payment Reference:</strong></p>
                    <p style="font-size: 20px; font-weight: bold; color: #0066FF; margin: 5px 0; letter-spacing: 1px;">${data.transferCode}</p>
                  </div>

                  <p style="font-size: 14px; color: #666; margin-top: 15px;">
                    <strong>Important:</strong> Please include the reference code <strong style="color: #0066FF;">${data.transferCode}</strong> when making your payment so we can process your booking quickly.
                  </p>
                </div>
                
                <div class="details">
                  <h3 style="margin-top: 0;">Booking Details</h3>
                  <div class="detail-row">
                    <span><strong>Booking Number:</strong></span>
                    <span>${data.bookingNumber}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Vehicle:</strong></span>
                    <span>${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Pick-up:</strong></span>
                    <span>${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Drop-off:</strong></span>
                    <span>${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Location:</strong></span>
                    <span>${data.location}</span>
                  </div>
                </div>
                
                <div style="background: #E8F4FF; padding: 15px; border-radius: 4px; margin: 20px 0;">
                  <h4 style="margin-top: 0; color: #0066FF;">📋 Next Steps:</h4>
                  <ol style="margin: 10px 0; padding-left: 20px;">
                    <li>Complete the bank transfer using the details above</li>
                    <li>Make sure to include <strong>${data.transferCode}</strong> as your payment reference</li>
                    <li>Once we receive your payment, we'll confirm your booking</li>
                    <li>You'll receive a confirmation email with pickup details</li>
                  </ol>
                </div>

                <p style="font-size: 14px; color: #666;">If you have any questions or need assistance, please don't hesitate to contact us.</p>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@rentcar.com</p>
                <p>&copy; ${new Date().getFullYear()} RentCar. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    console.log("[EMAIL] Manual payment instructions sent to:", data.to)
    return { success: true }
  } catch (error) {
    console.error("[EMAIL_ERROR]", error)
    return { error: "Failed to send email" }
  }
}

// Admin Notification Email for New Bookings
export async function sendAdminBookingNotification(data: {
  adminEmail: string
  userName: string
  userEmail: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  depositAmount: number
  transferCode: string
  bookingNumber: string
  bookingId: string
}) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "RentCar <noreply@rentcar.com>",
      to: data.adminEmail,
      subject: `🔔 New Booking - ${data.carName} (${data.bookingNumber})`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .alert-box { background: #FFF9E6; border-left: 4px solid #FFB800; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .transfer-code { background: #E8F4FF; border: 2px dashed #0066FF; padding: 10px; text-align: center; font-size: 20px; font-weight: bold; margin: 15px 0; border-radius: 4px; letter-spacing: 2px; color: #0066FF; }
              .action-button { display: inline-block; background: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔔 New Booking Received</h1>
              </div>
              <div class="content">
                <p><strong>A new booking has been created and is awaiting payment confirmation.</strong></p>
                
                <div class="alert-box">
                  <p style="margin: 0;"><strong>⚠️ Action Required:</strong> Customer needs to complete bank transfer payment. Confirm booking once payment is received.</p>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Booking Information</h3>
                  <div class="detail-row">
                    <span><strong>Booking Number:</strong></span>
                    <span>${data.bookingNumber}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Status:</strong></span>
                    <span style="background: #FEF3C7; color: #92400E; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">PENDING PAYMENT</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Vehicle:</strong></span>
                    <span>${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Pick-up:</strong></span>
                    <span>${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Drop-off:</strong></span>
                    <span>${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Location:</strong></span>
                    <span>${data.location}</span>
                  </div>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Customer Information</h3>
                  <div class="detail-row">
                    <span><strong>Name:</strong></span>
                    <span>${data.userName}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Email:</strong></span>
                    <span>${data.userEmail}</span>
                  </div>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Payment Details</h3>
                  <div style="margin-bottom: 10px;">
                    <strong>Transfer Reference Code:</strong>
                    <div class="transfer-code">${data.transferCode}</div>
                    <p style="font-size: 14px; color: #666; margin: 5px 0;">Customer should include this code in their bank transfer</p>
                  </div>
                  <div class="detail-row">
                    <span><strong>Deposit (20%):</strong></span>
                    <span>${formatCents(data.depositAmount)}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Total Amount:</strong></span>
                    <span style="color: #10B981; font-weight: bold; font-size: 18px;">${formatCents(data.totalPrice)}</span>
                  </div>
                </div>

                <div style="background: #E8F4FF; padding: 15px; border-radius: 4px; margin: 20px 0;">
                  <h4 style="margin-top: 0; color: #0066FF;">📋 Next Steps:</h4>
                  <ol style="margin: 10px 0; padding-left: 20px;">
                    <li>Wait for customer to complete bank transfer</li>
                    <li>Check bank account for payment with reference: <strong>${data.transferCode}</strong></li>
                    <li>Once payment is confirmed, go to admin dashboard</li>
                    <li>Update booking status to "CONFIRMED"</li>
                  </ol>
                </div>

                <div style="text-align: center; margin: 25px 0;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin" class="action-button">
                    Go to Admin Dashboard →
                  </a>
                </div>
              </div>
              <div class="footer">
                <p>This is an automated notification from your car rental system</p>
                <p>&copy; ${new Date().getFullYear()} RentCar Admin</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    console.log("[EMAIL] Admin notification sent to:", data.adminEmail)
    return { success: true }
  } catch (error) {
    console.error("[EMAIL_ERROR]", error)
    return { error: "Failed to send admin notification" }
  }
}
