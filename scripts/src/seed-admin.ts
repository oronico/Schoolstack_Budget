import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.");
  console.error("Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret pnpm --filter @workspace/scripts run seed-admin");
  process.exit(1);
}

async function seedAdmin(adminEmail: string, adminPassword: string, adminName: string) {
  console.log(`Seeding admin account: ${adminEmail}`);

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, adminEmail.toLowerCase()))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id));
    console.log(`Updated password for existing admin user (id: ${existing.id})`);
  } else {
    const [user] = await db
      .insert(usersTable)
      .values({
        email: adminEmail.toLowerCase(),
        name: adminName,
        passwordHash,
      })
      .returning();
    console.log(`Created admin user (id: ${user.id})`);
  }

  console.log("Done.");
  process.exit(0);
}

seedAdmin(ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME).catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
