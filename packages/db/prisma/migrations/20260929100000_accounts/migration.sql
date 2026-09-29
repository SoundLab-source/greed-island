-- Accounts: sessions move out of "user" into their own table (several devices,
-- expiry, sign-out), and one-time email sign-in tokens.

-- CreateEnum
CREATE TYPE "LoginPurpose" AS ENUM ('SIGN_IN', 'ATTACH');

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "session_expiry" CHECK ("expires_at" > "created_at")
);

-- CreateTable
CREATE TABLE "login_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" "LoginPurpose" NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "login_token_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "login_token_attach_has_user" CHECK ("purpose" <> 'ATTACH' OR "user_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");
CREATE INDEX "session_user_id_idx" ON "session"("user_id");
CREATE UNIQUE INDEX "login_token_token_hash_key" ON "login_token"("token_hash");
CREATE INDEX "login_token_email_created_at_idx" ON "login_token"("email", "created_at");

ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "login_token" ADD CONSTRAINT "login_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep existing anonymous players signed in: copy their token hashes over (valid 30 days).
INSERT INTO "session" ("user_id", "token_hash", "expires_at")
SELECT "id", "session_token_hash", CURRENT_TIMESTAMP + INTERVAL '30 days'
FROM "user" WHERE "session_token_hash" IS NOT NULL;

-- Now the old column can go.
DROP INDEX "user_session_token_hash_key";
ALTER TABLE "user" DROP COLUMN "session_token_hash",
ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);
