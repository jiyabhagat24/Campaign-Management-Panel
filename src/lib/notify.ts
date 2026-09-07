import { prisma } from "@/lib/prisma";

// Notification engine (brief slide 16): INSTANT = "your turn to act", sent to
// exactly one person the moment the ball moves to them. DIGEST = batched FYI,
// collected and sent on a schedule (wire real email delivery in production —
// see README "Notifications"). Both are written to the Notification table so
// the panel can render an in-app feed regardless of email delivery.
export async function notify(
  params:
    | { userId: string; clientId?: undefined; channel: "INSTANT" | "DIGEST"; title: string; body: string }
    | { userId?: undefined; clientId: string; channel: "INSTANT" | "DIGEST"; title: string; body: string }
) {
  await prisma.notification.create({ data: params });
  // TODO (production): if channel === "INSTANT", send immediately via SMTP
  // (see src/lib/mailer.ts stub + README). DIGEST entries should be picked up
  // by a scheduled job (cron / queue) that batches per user and sends at
  // fixed times (e.g. 9am, 4pm).
}
