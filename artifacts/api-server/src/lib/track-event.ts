import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";

export async function trackEvent(
  eventName: string,
  userId?: number | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(eventsTable).values({
      userId: userId ?? null,
      eventName,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error(`Failed to track event "${eventName}":`, err);
  }
}
