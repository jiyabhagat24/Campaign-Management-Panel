import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

// Runs slow, non-essential work (the SMTP round trip) after the response has
// been sent, so a save doesn't wait 1-3s on the mail server. Falls back to
// running inline when called outside a request (scripts, tests), where
// after() isn't available.
async function runAfterResponse(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    await work();
  }
}

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
    const { userId, clientId, title, body } = params;
    await runAfterResponse(async () => {
      try {
        const to = userId
          ? (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email
          : (await prisma.client.findUnique({ where: { id: clientId! }, select: { email: true } }))?.email;
        if (to) await sendMail(to, title, body);
      } catch (err) {
        console.error("[notify] email follow-up failed:", err);
      }
    });
  }
  // DIGEST entries are picked up later by a scheduled job (cron / queue)
  // that batches per recipient and sends at fixed times (e.g. 9am, 4pm) —
  // see sendMail's docstring in src/lib/mailer.ts.
}
