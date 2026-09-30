-- Submission guards. (New enum values can't be used in the migration that adds them.)

-- Review requests: a name request or a submission, with the matching fields.
ALTER TABLE "review_item" DROP CONSTRAINT "review_item_kind_shape";
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_kind_shape" CHECK (
  ("kind" = 'CHARACTER_NAME' AND "character_id" IS NOT NULL AND "proposed_name" IS NOT NULL AND "submission_id" IS NULL) OR
  ("kind" = 'FIGHTER_SUBMISSION' AND "submission_id" IS NOT NULL AND "character_id" IS NULL AND "proposed_name" IS NULL)
);
ALTER TABLE "review_item" DROP CONSTRAINT "review_item_status_shape";
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_status_shape" CHECK (
  ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL AND "note" IS NULL) OR
  ("status" IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL) OR
  ("status" = 'WITHDRAWN' AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NULL AND "note" IS NULL)
);
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_changes_only_submissions" CHECK (
  "status" <> 'CHANGES_REQUESTED' OR "kind" = 'FIGHTER_SUBMISSION'
);
ALTER TABLE "review_item" DROP CONSTRAINT "review_item_reject_note";
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_reject_note" CHECK (
  "status" NOT IN ('REJECTED', 'CHANGES_REQUESTED') OR "note" IS NOT NULL
);
-- One review waiting per submission.
CREATE UNIQUE INDEX "review_item_one_pending_submission" ON "review_item" ("submission_id")
  WHERE "kind" = 'FIGHTER_SUBMISSION' AND "status" = 'PENDING';

CREATE OR REPLACE FUNCTION review_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review requests are kept';
  END IF;
  IF (NEW."id", NEW."kind", NEW."submitted_by_user_id", NEW."character_id", NEW."proposed_name", NEW."submission_id", NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."kind", OLD."submitted_by_user_id", OLD."character_id", OLD."proposed_name", OLD."submission_id", OLD."created_at") THEN
    RAISE EXCEPTION 'what a review request asks for is fixed';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'a % review request can''t change', lower(OLD."status"::text);
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE "staff_action" DROP CONSTRAINT "staff_action_shape";
ALTER TABLE "staff_action" ADD CONSTRAINT "staff_action_shape" CHECK (
  ("kind" = 'ROLE_SET' AND "target_user_id" IS NOT NULL) OR
  ("kind" IN ('REVIEW_APPROVED', 'REVIEW_REJECTED', 'REVIEW_CHANGES_REQUESTED') AND "review_item_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
  ("kind" = 'DISPLAY_NAME_RESET' AND "target_user_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
  ("kind" = 'CHARACTER_NAME_RESET' AND "character_id" IS NOT NULL AND "actor_user_id" IS NOT NULL)
);

-- Submissions.
ALTER TABLE "submission"
  ADD CONSTRAINT "submission_community_key" CHECK ("community_key" = lower("community")),
  ADD CONSTRAINT "submission_shape" CHECK (
    ("status" = 'DRAFT' AND "closed_at" IS NULL) OR
    ("status" IN ('SUBMITTED', 'CHANGES_REQUESTED') AND "closed_at" IS NULL AND "submitted_at" IS NOT NULL AND "rights_confirmed_at" IS NOT NULL) OR
    ("status" IN ('APPROVED', 'REJECTED') AND "closed_at" IS NOT NULL AND "submitted_at" IS NOT NULL AND "rights_confirmed_at" IS NOT NULL) OR
    ("status" = 'WITHDRAWN' AND "closed_at" IS NOT NULL)
  );

-- One open submission per community.
CREATE UNIQUE INDEX "submission_one_open_per_community" ON "submission" ("community_key")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED');

-- Submissions are kept; their details change only while the submitter can edit
-- them (draft, or changes requested); status moves only along the allowed steps;
-- approved, rejected and withdrawn ones never change.
CREATE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submissions are kept';
  END IF;
  IF (NEW."id", NEW."number", NEW."submitted_by_user_id", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."number", OLD."submitted_by_user_id", OLD."created_at") THEN
    RAISE EXCEPTION 'who sent a submission is fixed';
  END IF;
  IF OLD."status" IN ('APPROVED', 'REJECTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'an % submission can''t change', lower(OLD."status"::text);
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'WITHDRAWN'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN'))
    OR (OLD."status" = 'CHANGES_REQUESTED' AND NEW."status" IN ('SUBMITTED', 'WITHDRAWN'))) THEN
    RAISE EXCEPTION 'a submission can''t go from % to %', OLD."status", NEW."status";
  END IF;
  IF OLD."status" NOT IN ('DRAFT', 'CHANGES_REQUESTED')
     AND (NEW."community", NEW."fighter_name", NEW."archetype", NEW."description", NEW."rights_basis", NEW."rights_details", NEW."rights_link")
         IS DISTINCT FROM
         (OLD."community", OLD."fighter_name", OLD."archetype", OLD."description", OLD."rights_basis", OLD."rights_details", OLD."rights_link") THEN
    RAISE EXCEPTION 'a submission''s details can''t change while it''s being reviewed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER submission_guard
  BEFORE UPDATE OR DELETE ON "submission"
  FOR EACH ROW EXECUTE FUNCTION submission_guard();

-- Images: added or removed only while the submission can be edited; never changed.
ALTER TABLE "submission_file"
  ADD CONSTRAINT "submission_file_hash" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "submission_file_size" CHECK ("bytes" > 0 AND "width" > 0 AND "height" > 0),
  ADD CONSTRAINT "submission_file_label" CHECK (length("label") BETWEEN 1 AND 60);

CREATE FUNCTION submission_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "SubmissionStatus";
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'submission images can''t be changed, only added or removed';
  END IF;
  SELECT "status" INTO parent_status FROM "submission"
    WHERE "id" = (CASE WHEN TG_OP = 'INSERT' THEN NEW."submission_id" ELSE OLD."submission_id" END);
  IF parent_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'images can only change while the submission can be edited (it''s %)', lower(parent_status::text);
  END IF;
  RETURN CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE OLD END;
END $$;

CREATE TRIGGER submission_file_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "submission_file"
  FOR EACH ROW EXECUTE FUNCTION submission_file_guard();
