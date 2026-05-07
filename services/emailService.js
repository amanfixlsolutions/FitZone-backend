const logger = require("../utils/logger");

// ─────────────────────────────────────────────────────────────────
// Email Service — tries providers in order:
// 1. Brevo (HTTPS API, free, no domain verification, works on Render)
// 2. Resend (HTTPS API, free but needs domain for other recipients)
// 3. Gmail SMTP (blocked on Render free tier)
// ─────────────────────────────────────────────────────────────────

// ── 1. Brevo (recommended — sends to any email, no domain needed) ──
const sendViaBrevo = async ({ to, subject, html }) => {
  const SibApiV3Sdk = require("@getbrevo/brevo");
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  apiInstance.setApiKey(
    SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
  );

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html;
  sendSmtpEmail.sender = {
    name:  "FitZone",
    email: process.env.EMAIL_USER || "amanjoshi9511@gmail.com",
  };
  sendSmtpEmail.to = [{ email: to }];

  const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
  return result;
};

// ── 2. Resend (works only for owner's email on free plan) ──────────
const sendViaResend = async ({ to, subject, html }) => {
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from:    "FitZone <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message || "Resend error");
  return data;
};

// ── 3. Gmail SMTP (fallback — blocked on Render) ───────────────────
let _transporter = null;
let _lastUser    = null;

const sendViaGmail = async ({ to, subject, html }) => {
  const nodemailer = require("nodemailer");
  const user = process.env.EMAIL_USER;
  if (_transporter && _lastUser !== user) { _transporter = null; }
  if (!_transporter) {
    _lastUser = user;
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      socketTimeout:     15000,
    });
  }
  const from = process.env.EMAIL_FROM || `FitZone <${user}>`;
  const info = await _transporter.sendMail({ from, to, subject, html });
  return info;
};

// ── Main sendEmail ─────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  if (!to) throw new Error("Recipient email is required");

  const errors = [];

  // 1. Try Brevo
  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY !== "your_brevo_api_key") {
    try {
      const result = await sendViaBrevo({ to, subject, html });
      logger.info(`✉️  Email sent via Brevo to ${to}`);
      return result;
    } catch (err) {
      errors.push(`Brevo: ${err.message}`);
      logger.warn(`Brevo failed: ${err.message}`);
    }
  }

  // 2. Try Resend
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "your_resend_api_key") {
    try {
      const result = await sendViaResend({ to, subject, html });
      logger.info(`✉️  Email sent via Resend to ${to}`);
      return result;
    } catch (err) {
      errors.push(`Resend: ${err.message}`);
      logger.warn(`Resend failed: ${err.message}`);
    }
  }

  // 3. Try Gmail SMTP
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS &&
      process.env.EMAIL_USER !== "your_gmail@gmail.com") {
    try {
      const info = await sendViaGmail({ to, subject, html });
      logger.info(`✉️  Email sent via Gmail to ${to}`);
      return info;
    } catch (err) {
      errors.push(`Gmail: ${err.message}`);
      _transporter = null;
    }
  }

  throw new Error(`All email providers failed: ${errors.join(" | ")}`);
};

// ── OTP Email ──────────────────────────────────────────────────────
exports.sendOTPEmail = (email, otp, type) => {
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

  return sendEmail({
    to: email,
    subject: titles[type] || "Your FitZone OTP",
    html: `
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
    `,
  });
};

// ── Welcome Email ──────────────────────────────────────────────────
exports.sendWelcomeEmail = (user) =>
  sendEmail({
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
  }).catch(() => {});

// ── Payment Confirmation ───────────────────────────────────────────
exports.sendPaymentConfirmation = (member, payment) =>
  sendEmail({
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
  }).catch(() => {});

// ── Membership Expiry Reminder ─────────────────────────────────────
exports.sendExpiryReminder = (member, daysLeft) =>
  sendEmail({
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
  }).catch(() => {});

// ── Gym Approval Email ─────────────────────────────────────────────
exports.sendGymApprovalEmail = (gymOwner, gymName, approved) =>
  sendEmail({
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
  }).catch(() => {});

exports.sendEmail = sendEmail;
