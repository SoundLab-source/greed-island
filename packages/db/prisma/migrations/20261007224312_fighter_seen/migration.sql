-- CreateTable
CREATE TABLE "fighter_seen" (
    "user_id" UUID NOT NULL,
    "fighter_id" TEXT NOT NULL,
    "fight_id" UUID NOT NULL,
    "seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fighter_seen_pkey" PRIMARY KEY ("user_id","fighter_id")
);

-- AddForeignKey
ALTER TABLE "fighter_seen" ADD CONSTRAINT "fighter_seen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fighter_seen" ADD CONSTRAINT "fighter_seen_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fighter_seen" ADD CONSTRAINT "fighter_seen_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
