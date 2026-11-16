-- CreateIndex
CREATE INDEX "fight_closed_at_idx" ON "fight"("closed_at");

-- CreateIndex
CREATE INDEX "fight_side1_character_id_number_idx" ON "fight"("side1_character_id", "number");

-- CreateIndex
CREATE INDEX "fight_side2_character_id_number_idx" ON "fight"("side2_character_id", "number");
