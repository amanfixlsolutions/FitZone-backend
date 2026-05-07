const logger = require("../utils/logger");

// Resend email service (works on Render)
const sendViaResend = async ({ to, subject, html }) => {
  const { Resend } = require("resend");
  
  // Check if API key exists
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "your_resend_api_key") {
    throw new Error("RESEND_API_KEY is not configured. Please add it to your environment variables.");
  }
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  // Use Resend's test domain or your custom domain
  const from = process.env.EMAIL_FROM || "FitZone <onboarding@resend.dev>";
  
  logger.info(`Attempting to send email via Resend to: ${to}`);
  
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Resend API timeout after 15 seconds")), 15000);
    });
    
    const sendPromise = resend.emails.send({ from, to, subject, html });
    const result = await Promise.race([sendPromise, timeoutPromise]);
    
    logger.info(`✅ Email sent successfully via Resend to ${to}`);
    return result;
  } catch (error) {
    logger.error(`Resend error: ${error.message}`);
    throw new Error(`Resend failed: ${error.message}`);
  }
};

// Main sendEmail function - Resend only
const sendEmail = async ({ to, subject, html }) => {
  if (!to) {
    throw new Error("Recipient email is required");
  }
  
  // Only use Resend (Gmail SMTP won't work reliably on Render)
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "your_resend_api_key") {
    return await sendViaResend({ to, subject, html });
  }
  
  throw new Error("RESEND_API_KEY not configured. Please add it to your environment variables on Render.");
};

// OTP Email Function
exports.sendOTPEmail = async (email, otp, type) => {
  const titles = {
    "signup":         "Verify Your Email — FitZone",
    "reset-password": "Reset Your Password — FitZone",
    "verify-email":   "Email Verification — FitZone",
  };
  
  const messages = {
    "signup":         "Use the OTP below to verify your email and complete registration.",
    "reset-password": "Use the OTP below to reset your password.",
    "verify-email":   "Use the OTP below to verify your email address.",
  };
  
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:28px;font-weight:900">FitZone</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">Gym Management Platform</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px">Email Verification</h2>
        <p style="color:#6b7280;font-size:14px;margin:0 0 24px">${messages[type] || "Your OTP:"}</p>
        <div style="background:#fef3c7;border:2px dashed #f59e0b;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
          <p style="color:#92400e;font-size:13px;margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Your OTP Code</p>
          <p style="color:#1f2937;font-size:40px;font-weight:900;letter-spacing:12px;margin:0">${otp}</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
          This OTP expires in <strong>${process.env.OTP_EXPIRE_MINUTES || 10} minutes</strong>.<br/>
          Do not share this code with anyone.
        </p>
      </div>
      <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb">
        <p style="color:#9ca3af;font-size:11px;margin:0">© ${new Date().getFullYear()} FitZone. All rights reserved.</p>
      </div>
    </div>
  `;
  
  return await sendEmail({ to: email, subject: titles[type] || "Your FitZone OTP", html });
};

// Welcome Email
exports.sendWelcomeEmail = async (user) => {
  try {
    await sendEmail({
      to: user.email,
      subject: "Welcome to FitZone! 🏋️",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:32px;text-align:center;border-radius:16px 16px 0 0">
            <h1 style="color:#fff;margin:0;font-size:28px;font-weight:900">Welcome to FitZone!</h1>
          </div>
          <div style="padding:32px;background:#fff;border-radius:0 0 16px 16px">
            <h2 style="color:#1f2937">Hi ${user.name}! 👋</h2>
            <p style="color:#6b7280">Your account has been created successfully. Start your fitness journey today!</p>
            <a href="${process.env.CLIENT_URL}/login" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">
              Go to Dashboard →
            </a>
          </div>
        </div>
      `,
    });
  } catch (error) {
    logger.error(`Welcome email failed for ${user.email}: ${error.message}`);
    // Don't throw - welcome email failure shouldn't break registration
  }
};

// Payment Confirmation
exports.sendPaymentConfirmation = async (member, payment) => {
  try {
    await sendEmail({
      to: member.email,
      subject: "✅ Payment Confirmed — FitZone",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1f2937">Payment Confirmed!</h2>
          <p style="color:#6b7280">Hi ${member.name}, your payment has been received.</p>
          <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:16px 0">
            <p style="margin:4px 0;color:#374151"><strong>Amount:</strong> ₹${payment.amount}</p>
            <p style="margin:4px 0;color:#374151"><strong>Plan:</strong> ${payment.planName}</p>
            <p style="margin:4px 0;color:#374151"><strong>Transaction ID:</strong> ${payment._id}</p>
            <p style="margin:4px 0;color:#374151"><strong>Date:</strong> ${new Date(payment.createdAt).toLocaleDateString("en-IN")}</p>
          </div>
        </div>
      `,
    });
  } catch (error) {
    logger.error(`Payment confirmation email failed: ${error.message}`);
  }
};

// Expiry Reminder
exports.sendExpiryReminder = async (member, daysLeft) => {
  try {
    await sendEmail({
      to: member.email,
      subject: `⚠️ Membership expires in ${daysLeft} days — FitZone`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1f2937">Membership Expiring Soon</h2>
          <p style="color:#6b7280">Hi ${member.name}, your <strong>${member.planName}</strong> membership expires in <strong>${daysLeft} days</strong>.</p>
          <a href="${process.env.CLIENT_URL}/membership" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">
            Renew Now →
          </a>
        </div>
      `,
    });
  } catch (error) {
    logger.error(`Expiry reminder email failed: ${error.message}`);
  }
};

// Gym Approval Email
exports.sendGymApprovalEmail = async (gymOwner, gymName, approved) => {
  try {
    await sendEmail({
      to: gymOwner.email,
      subject: approved ? "🎉 Your gym is approved!" : "❌ Gym application update",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1f2937">Hi ${gymOwner.name},</h2>
          ${approved
            ? `<p style="color:#6b7280">Congratulations! <strong>${gymName}</strong> has been approved on FitZone.</p>`
            : `<p style="color:#6b7280">Your application for <strong>${gymName}</strong> was not approved. Please contact support.</p>`
          }
        </div>
      `,
    });
  } catch (error) {
    logger.error(`Gym approval email failed: ${error.message}`);
  }
};

// Export main function for testing
exports.sendEmail = sendEmail;