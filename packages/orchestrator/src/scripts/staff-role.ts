// `pnpm staff:role`: list staff. `pnpm staff:role <email> <admin|moderator|player>`: set an account's
// role (the only way to appoint or remove an admin). The account must have signed in with that email first.
import { createDb, loadRepoEnv, NotFoundError } from "@greed-island/db";
import { LedgerRuleError, USER_ROLES, type UserRole } from "@greed-island/shared";
import { staffMembers } from "../api/staff-views.ts";
import { setRole } from "../staff.ts";

loadRepoEnv();
const [email, roleArg, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
const db = createDb();
try {
  if (!email) {
    const staff = await staffMembers(db, "ADMIN");
    console.log(staff.length ? staff.map((s) => `${s.role.padEnd(9)} ${s.email ?? "-"} (${s.name})`).join("\n") : "No staff yet. Appoint an admin: pnpm staff:role <email> admin");
  } else {
    const role = roleArg?.toUpperCase() as UserRole | undefined;
    if (!role || !USER_ROLES.includes(role) || rest.length) {
      console.error("Usage: pnpm staff:role <email> <admin|moderator|player>");
      process.exitCode = 2;
    } else {
      const r = await setRole(db, { actorId: null, target: { email }, role, note: "set from the server's command line" });
      console.log(r.changed ? `${email}: ${r.from.toLowerCase()} -> ${r.to.toLowerCase()} (logged in the staff log)` : `${email} is already ${r.to.toLowerCase()}`);
    }
  }
} catch (err) {
  if (err instanceof NotFoundError) {
    console.error(`${err.message}. Sign in once with that email (the sign-in link on the dev page), then run this again.`);
  } else if (err instanceof LedgerRuleError) {
    console.error(err.message);
  } else {
    throw err;
  }
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
