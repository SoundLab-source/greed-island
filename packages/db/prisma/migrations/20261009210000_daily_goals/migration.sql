-- Daily goals (docs/ENGAGEMENT.md §5): three a day per player, paid from issuance when done.
ALTER TYPE "TxnKind" ADD VALUE 'GOAL_REWARD';

CREATE TABLE "player_goal" (
    "user_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "slot" SMALLINT NOT NULL,
    "code" TEXT NOT NULL,
    "swapped" BOOLEAN NOT NULL DEFAULT false,
    "reward" DECIMAL(20,0),
    "done_at" TIMESTAMPTZ(3),
    "fight_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_goal_pkey" PRIMARY KEY ("user_id","day","slot"),
    CONSTRAINT "player_goal_slot" CHECK ("slot" IN (0, 1, 2)),
    CONSTRAINT "player_goal_day" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT "player_goal_paid" CHECK (("done_at" IS NULL) = ("reward" IS NULL))
);

ALTER TABLE "player_goal" ADD CONSTRAINT "player_goal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
