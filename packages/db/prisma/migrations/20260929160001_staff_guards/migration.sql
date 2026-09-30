-- Staff guards. (New enum values can't be used in the migration that adds them.)

-- Only accounts with a verified email can be staff.
ALTER TABLE "user" ADD CONSTRAINT "user_staff_verified" CHECK ("role" = 'PLAYER' OR "email_verified_at" IS NOT NULL);

ALTER TABLE "review_item"
  ADD CONSTRAINT "review_item_kind_shape" CHECK (
    "kind" <> 'CHARACTER_NAME' OR ("character_id" IS NOT NULL AND "proposed_name" IS NOT NULL)
  ),
  ADD CONSTRAINT "review_item_status_shape" CHECK (
    ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL AND "note" IS NULL) OR
    ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL) OR
    ("status" = 'WITHDRAWN' AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NULL AND "note" IS NULL)
  ),
  ADD CONSTRAINT "review_item_previous_name" CHECK ("previous_name" IS NULL OR "status" = 'APPROVED'),
  ADD CONSTRAINT "review_item_reject_note" CHECK ("status" <> 'REJECTED' OR "note" IS NOT NULL);

-- One name request waiting per character.
CREATE UNIQUE INDEX "review_item_one_pending_name" ON "review_item" ("character_id")
  WHERE "kind" = 'CHARACTER_NAME' AND "status" = 'PENDING';

-- Requests are kept, what was asked never changes, and a decision is final:
-- PENDING -> APPROVED | REJECTED | WITHDRAWN.
CREATE FUNCTION review_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review requests are kept';
  END IF;
  IF (NEW."id", NEW."kind", NEW."submitted_by_user_id", NEW."character_id", NEW."proposed_name", NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."kind", OLD."submitted_by_user_id", OLD."character_id", OLD."proposed_name", OLD."created_at") THEN
    RAISE EXCEPTION 'what a review request asks for is fixed';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'a % review request can''t change', lower(OLD."status"::text);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER review_item_guard
  BEFORE UPDATE OR DELETE ON "review_item"
  FOR EACH ROW EXECUTE FUNCTION review_item_guard();

-- The staff log: each action names what it touched; actions from the page
-- record a staff actor and their role, command-line ones neither.
ALTER TABLE "staff_action"
  ADD CONSTRAINT "staff_action_shape" CHECK (
    ("kind" = 'ROLE_SET' AND "target_user_id" IS NOT NULL) OR
    ("kind" IN ('REVIEW_APPROVED', 'REVIEW_REJECTED') AND "review_item_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
    ("kind" = 'DISPLAY_NAME_RESET' AND "target_user_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
    ("kind" = 'CHARACTER_NAME_RESET' AND "character_id" IS NOT NULL AND "actor_user_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "staff_action_actor" CHECK (
    ("actor_user_id" IS NULL AND "actor_role" IS NULL) OR
    ("actor_user_id" IS NOT NULL AND "actor_role" IN ('MODERATOR', 'ADMIN'))
  );

CREATE TRIGGER staff_action_append_only
  BEFORE UPDATE OR DELETE ON "staff_action"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
