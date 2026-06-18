import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants, users } from "@/db/schema";

/**
 * Run 1 dev-auth stub.
 *
 * There is no real auth provider and no tenant switcher. The server resolves a
 * single demo tenant + demo user by their well-known slug/email. tenantId and
 * userId always come from the server (never from the client). Repositories then
 * require this tenantId for every query and mutation.
 *
 * TODO(auth): replace with a production auth provider; derive tenant from the
 * authenticated session/membership rather than a hardcoded slug.
 */
export const DEMO_TENANT_SLUG = "atlantic-hideaway";
export const DEMO_USER_EMAIL = "sofia@atlantic-hideaway.test";

export interface AuthContext {
  tenantId: string;
  userId: string;
  tenantName: string;
  userName: string;
}

export async function getAuthContext(): Promise<AuthContext> {
  const db = getDb();

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_TENANT_SLUG))
    .limit(1);

  if (!tenant) {
    throw new Error(
      "Demo tenant not found. Run `npm run db:migrate` then `npm run db:seed`.",
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, DEMO_USER_EMAIL)))
    .limit(1);

  if (!user) {
    throw new Error("Demo user not found. Run `npm run db:seed`.");
  }

  return {
    tenantId: tenant.id,
    userId: user.id,
    tenantName: tenant.name,
    userName: user.name,
  };
}
