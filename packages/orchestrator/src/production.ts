/**
 * Start-up checks for a public deployment (GI_ENV=production, docs/MVP.md):
 * the server refuses to start with settings that are only fine on a
 * developer's machine. Pure: returns the problems, empty when all is well.
 */
export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GI_ENV"] === "production";
}

export function productionProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const publicUrl = env["GI_PUBLIC_URL"]?.trim();
  if (!publicUrl) problems.push("GI_PUBLIC_URL is not set: sign-in links need the site's public address (https://...).");
  else if (!publicUrl.startsWith("https://")) problems.push(`GI_PUBLIC_URL must be an https:// address (got ${publicUrl}).`);
  if (!env["GI_SMTP_URL"]?.trim()) problems.push("GI_SMTP_URL is not set: without a mail server nobody can sign in with their email.");
  if (!env["GI_MAIL_FROM"]?.trim()) problems.push("GI_MAIL_FROM is not set (e.g. Greed Island <no-reply@your-domain>).");
  if (env["ENGINE_MODE"] !== "live") problems.push(`ENGINE_MODE must be live on the stream machine (got ${env["ENGINE_MODE"] ?? "fake"}).`);
  if (!env["IKEMEN_DIR"]?.trim()) problems.push("IKEMEN_DIR is not set.");
  if (env["GI_RATE_LIMITS"] === "off") problems.push("GI_RATE_LIMITS=off: rate limits must stay on for a public site.");
  const host = env["GI_HOST"]?.trim() ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    problems.push(`GI_HOST=${host} serves plain HTTP to the network. Keep GI_HOST=127.0.0.1 and put the tunnel or HTTPS proxy in front (docs/DEPLOY.md).`);
  }
  const db = env["DATABASE_URL"] ?? "";
  try {
    const u = new URL(db);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
    if (!local && decodeURIComponent(u.password) === "greed") problems.push("DATABASE_URL points at another machine with the default password: use a strong one.");
  } catch {
    problems.push("DATABASE_URL is missing or not a valid URL.");
  }
  return problems;
}
