-- Follow a fighter (docs/ENGAGEMENT.md §4): which fighters a player follows, for a heads-up when one is about to fight.
CREATE TABLE "fighter_follow" (
    "user_id" UUID NOT NULL,
    "fighter_id" TEXT NOT NULL,
    "followed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fighter_follow_pkey" PRIMARY KEY ("user_id","fighter_id")
);

CREATE INDEX "fighter_follow_fighter_id_idx" ON "fighter_follow"("fighter_id");

ALTER TABLE "fighter_follow" ADD CONSTRAINT "fighter_follow_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fighter_follow" ADD CONSTRAINT "fighter_follow_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
