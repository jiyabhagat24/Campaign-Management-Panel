import nodemailer from "nodemailer";

// Real email delivery, wired to notify() (src/lib/notify.ts) for every
// INSTANT notification — the in-app Notification row is written regardless,
// this just also fires an email to the recipient's work address (User.email)
// or client email (Client.email) when SMTP_* env vars are set.
//
// If SMTP_HOST isn't configured (local dev, or before ops sets it up in
// Vercel), this silently no-ops with a console log instead of throwing —
// missing email config should never break the in-app flow that created the
// notification in the first place.
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, body: string) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — skipped email to ${to}: ${subject}`);
    return;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || "notifications@theboredmonkey.com",
      to,
      subject,
      text: body,
      html: `<p style="font-family:sans-serif;font-size:14px;color:#1e293b;">${body.replace(/\n/g, "<br/>")}</p>`,
    });
  } catch (err) {
    // Never let a failed email delivery break the caller's request flow —
    // the in-app Notification row already exists, so the user isn't
    // actually blind to this, just missing the email copy.
    console.error(`[mailer] failed to send email to ${to}:`, err);
  }
}

// DIGEST batching: run a scheduled job (Vercel Cron / node-cron / a queue
// worker) every N hours that groups unread channel:"DIGEST" notifications by
// userId and sends one email per user via sendMail above, then marks them
// read.
//
// Client-facing emails must go through a fixed template that only ever
// renders quotedCost, never internalCost — build that template once, reuse
// it everywhere a client email fires (brief slide 07, "close these leak
// points").
