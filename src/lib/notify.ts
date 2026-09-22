import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

// Notification engine (brief slide 16): INSTANT = "your turn to act", sent to
// exactly one person the moment the ball moves to them. DIGEST = batched FYI,
// collected and sent on a schedule. Both are written to the Notification
// table so the panel's in-app feed always works regardless of email
// delivery; INSTANT additionally fires a real email (via sendMail, which
// itself no-ops safely if SMTP isn't configured) to the recipient's work
// email (User.email) or client email (Client.email).
export async function notify(
  params:
    | { userId: string; clientId?: undefined; channel: "INSTANT" | "DIGEST"; title: string; body: string }
    | { userId?: undefined; clientId: string; channel: "INSTANT" | "DIGEST"; title: string; body: string }
) {
  await prisma.notification.create({ data: params });

  if (params.channel === "INSTANT") {
    const to = params.userId
      ? (await prisma.user.findUnique({ where: { id: params.userId }, select: { email: true } }))?.email
      : (await prisma.client.findUnique({ where: { id: params.clientId }, select: { email: true } }))?.email;
    if (to) await sendMail(to, params.title, params.body);
  }
  // DIGEST entries are picked up later by a scheduled job (cron / queue)
  // that batches per recipient and sends at fixed times (e.g. 9am, 4pm) —
  // see sendMail's docstring in src/lib/mailer.ts.
}
