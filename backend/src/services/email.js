const nodemailer = require("nodemailer");

function isEmailDeliveryConfigured() {
  const has = key => Boolean(String(process.env[key] || "").trim());
  return Boolean((has("BREVO_API_KEY") && has("BREVO_SENDER_EMAIL"))
    || (has("SMTP_HOST") && has("SMTP_USER") && has("SMTP_PASS")));
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
  const brevoApiKey = String(process.env.BREVO_API_KEY || "").trim();
  const brevoSenderEmail = String(process.env.BREVO_SENDER_EMAIL || "").trim();
  if (brevoApiKey && brevoSenderEmail) {
    if (typeof fetch !== "function") throw Object.assign(new Error("HTTPS email delivery is unavailable in this Node runtime."), { code: "FETCH_UNAVAILABLE" });
    const senderName = String(process.env.BREVO_SENDER_NAME || "Sucharu").trim().slice(0, 70) || "Sucharu";
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": brevoApiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: senderName, email: brevoSenderEmail },
        to: [{ email }],
        subject: "Your Sucharu password reset code",
        textContent: `Your Sucharu password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        htmlContent: `<div style="font-family:Arial,sans-serif;color:#173c34;max-width:520px;margin:auto;padding:24px"><h2>Reset your Sucharu password</h2><p>Use this one-time code in the app:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
      }),
    });
    if (!response.ok) {
      throw Object.assign(new Error("The HTTPS email provider rejected the reset email."), { code: `BREVO_HTTP_${response.status}` });
    }
    return;
  }

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
