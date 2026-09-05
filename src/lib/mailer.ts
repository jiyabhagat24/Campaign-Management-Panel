// Notification delivery stub. notify() in src/lib/notify.ts already writes
// every notification to the Notification table (so the in-app feed always
// works); wire actual email delivery here for INSTANT + DIGEST.
//
// Quickest path: nodemailer + your SMTP_* env vars (Google Workspace SMTP,
// Postmark, SES, Resend, etc. all work as plain SMTP). Example:
//
//   import nodemailer from "nodemailer";
//   const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: Number(process.env.SMTP_PORT),
//     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
//   });
//   export async function sendMail(to: string, subject: string, html: string) {
//     await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
//   }
//
// Client-facing emails must go through a fixed template that only ever
// renders quotedCost, never internalCost — build that template once, reuse
// it everywhere a client email fires (brief slide 07, "close these leak
// points").
//
// DIGEST batching: run a scheduled job (Vercel Cron / node-cron / a queue
// worker) every N hours that groups unread channel:"DIGEST" notifications by
// userId and sends one email per user, then marks them read.

export {};
