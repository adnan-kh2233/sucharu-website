const nodemailer = require("nodemailer");

function isEmailDeliveryConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  if (!isEmailDeliveryConfigured()) throw new Error("Email delivery is not configured.");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendCustomerPasswordResetCode(email, code) {
  const transporter = createTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to: email,
    subject: "Your Sucharu password reset code",
    text: `Your Sucharu password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#173c34;max-width:520px;margin:auto;padding:24px"><h2>Reset your Sucharu password</h2><p>Use this one-time code in the app:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
  });
}

module.exports = { isEmailDeliveryConfigured, sendCustomerPasswordResetCode };
