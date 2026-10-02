-- Submission check guards.

-- What each status carries.
ALTER TABLE "submission_check" ADD CONSTRAINT "submission_check_shape" CHECK (
  ("status" = 'QUEUED' AND "started_at" IS NULL AND "finished_at" IS NULL AND "results" IS NULL AND "error" IS NULL) OR
  ("status" = 'RUNNING' AND "started_at" IS NOT NULL AND "finished_at" IS NULL AND "results" IS NULL AND "error" IS NULL) OR
  ("status" IN ('PASSED', 'FAILED') AND "started_at" IS NOT NULL AND "finished_at" IS NOT NULL AND "results" IS NOT NULL AND "error" IS NULL) OR
  ("status" = 'ERROR' AND "finished_at" IS NOT NULL AND "results" IS NULL AND "error" IS NOT NULL)
);

-- One run waiting or in progress per submission.
CREATE UNIQUE INDEX "submission_check_one_open" ON "submission_check" ("submission_id")
  WHERE "status" IN ('QUEUED', 'RUNNING');

-- Runs are kept; a finished one never changes; a run moves forward only
-- (a run interrupted by a restart goes back to the queue).
CREATE FUNCTION submission_check_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submission checks are kept';
  END IF;
  IF (NEW."id", NEW."submission_id", NEW."requested_by_user_id", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."submission_id", OLD."requested_by_user_id", OLD."created_at") THEN
    RAISE EXCEPTION 'what a submission check is for, and who asked for it, are fixed';
  END IF;
  IF OLD."status" IN ('PASSED', 'FAILED', 'ERROR') THEN
    RAISE EXCEPTION 'a finished submission check can''t change';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'QUEUED' AND NEW."status" IN ('RUNNING', 'ERROR'))
    OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('PASSED', 'FAILED', 'ERROR', 'QUEUED'))) THEN
    RAISE EXCEPTION 'a submission check can''t go from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER submission_check_guard
  BEFORE UPDATE OR DELETE ON "submission_check"
  FOR EACH ROW EXECUTE FUNCTION submission_check_guard();
