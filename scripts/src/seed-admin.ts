import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "aserafin@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "@adm1n2026";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

async function seedAdmin() {
  console.log(`Seeding admin account: ${ADMIN_EMAIL}`);

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL.toLowerCase()))
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
        email: ADMIN_EMAIL.toLowerCase(),
        name: ADMIN_NAME,
        passwordHash,
      })
      .returning();
    console.log(`Created admin user (id: ${user.id})`);
  }

  console.log("Done.");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
