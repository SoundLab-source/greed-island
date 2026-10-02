/**
 * The automatic checks on submitted fighters (docs/PHASE3.md step 4): a smoke
 * test, the template check and a balance simulation, for staff to see next to
 * the review. A run is queued when a submission is sent for review (or by
 * staff, to run them again); one worker takes them oldest first.
 *
 * A fighter is checked as the engine character it will fight as. Until
 * community fighters are built from their own art, that is its archetype's
 * template (`pickStandIn`), so the run confirms the template is installed,
 * runs, and reports the template's own record against the other templates.
 */
import { NotFoundError, withRetry, type Db, type Prisma, type Tx } from "@greed-island/db";
import { CheckError, checkFighter, type CheckFighter, type EventSource } from "@greed-island/engine";
import { checksPassed, pickStandIn, TEMPLATE_ID_PREFIX, type CheckResults, type CheckSettings, type WinTally } from "@greed-island/shared";
import { requireStaff } from "./staff.ts";

type CheckRow = Awaited<ReturnType<Tx["submissionCheck"]["findUniqueOrThrow"]>>;

/** How many opponents and stages a balance simulation uses at most. */
const MAX_OPPONENTS = 4;
const MAX_STAGES = 3;

export interface CheckRunnerDeps {
  /** The sim engine; null when this server has none (no IKEMEN_DIR), and every run ends as "couldn't run". */
  source: EventSource | null;
  settings: CheckSettings;
  /** Sim fights at a time. */
  parallel: number;
  /** Each reference fighter's record, kept between runs (CheckRunner keeps one for the life of the server). */
  referenceRecords: Map<string, WinTally>;
  signal?: AbortSignal;
}

/** Queue a run, unless one is already waiting or running for this submission (then that one is returned). */
export async function queueSubmissionCheck(tx: Tx, submissionId: string, requestedByUserId: string | null, now = new Date()): Promise<CheckRow> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7110, hashtext(${submissionId}))`;
  const open = await tx.submissionCheck.findFirst({ where: { submissionId, status: { in: ["QUEUED", "RUNNING"] } } });
  return open ?? tx.submissionCheck.create({ data: { submissionId, requestedByUserId, createdAt: now } });
}

/** Staff: run the checks on a submission again. */
export async function requestSubmissionCheck(db: Db, input: { actorId: string; submissionId: string }, now = new Date()): Promise<CheckRow> {
  return withRetry(db, async (tx) => {
    await requireStaff(tx, input.actorId, "review");
    const sub = await tx.submission.findUnique({ where: { id: input.submissionId }, select: { id: true } });
    if (!sub) throw new NotFoundError("no such submission");
    return queueSubmissionCheck(tx, sub.id, input.actorId, now);
  });
}

/** After a restart: runs that were in progress go back to the queue. Returns how many. */
export async function requeueInterruptedChecks(db: Db): Promise<number> {
  const { count } = await db.submissionCheck.updateMany({ where: { status: "RUNNING" }, data: { status: "QUEUED", startedAt: null } });
  return count;
}

/** The oldest queued run, marked as running; null when the queue is empty. */
async function claimNext(db: Db, now: Date): Promise<CheckRow | null> {
  return withRetry(db, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "submission_check" WHERE "status" = 'QUEUED' ORDER BY "created_at", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return null;
    return tx.submissionCheck.update({ where: { id: rows[0]!.id }, data: { status: "RUNNING", startedAt: now } });
  });
}

/** Who the fighter is checked as, and against whom, from the roster as it is now. */
async function castFor(db: Db, submissionId: string) {
  const sub = await db.submission.findUniqueOrThrow({ where: { id: submissionId }, select: { archetype: true, fighterName: true } });
  const roster = await db.fighter.findMany({ where: { enabled: true, source: "ROSTER" }, orderBy: { id: "asc" } });
  const standIn = pickStandIn(roster, sub.archetype);
  if (!standIn) throw new CheckError("there are no fighters on the roster to check it as");
  const asFighter = (f: (typeof roster)[number]): CheckFighter => ({ id: f.id, name: f.displayName, defPath: f.defPath });
  const others = roster.filter((f) => f.id !== standIn.id);
  const templates = others.filter((f) => f.id.startsWith(TEMPLATE_ID_PREFIX));
  const opponents = (templates.length ? templates : others).slice(0, MAX_OPPONENTS).map(asFighter);
  const allStages = await db.stage.findMany({ where: { enabled: true }, orderBy: { id: "asc" } });
  const ours = allStages.filter((s) => s.id.startsWith("gi-"));
  const stages = (ours.length ? ours : allStages).slice(0, MAX_STAGES).map((s) => ({ id: s.id, name: s.displayName, defPath: s.defPath }));
  return { sub, standIn, fighter: asFighter(standIn), opponents, stages };
}

/**
 * Run the oldest queued check to its end. Returns the finished row, or null
 * when there was nothing to do (or the server is stopping: the run stays in
 * progress and is queued again at the next start).
 */
export async function runNextSubmissionCheck(db: Db, deps: CheckRunnerDeps, clock: () => Date = () => new Date()): Promise<CheckRow | null> {
  const run = await claimNext(db, clock());
  if (!run) return null;
  const finish = (data: Prisma.SubmissionCheckUpdateInput) => db.submissionCheck.update({ where: { id: run.id }, data: { ...data, finishedAt: clock() } });
  try {
    if (!deps.source) throw new CheckError("this server has no game engine to run the checks with (IKEMEN_DIR isn't set)");
    const cast = await castFor(db, run.submissionId);
    const results: CheckResults = await checkFighter(
      { fighter: { ...cast.fighter, ownArt: false }, reference: cast.fighter, opponents: cast.opponents, stages: cast.stages, settings: deps.settings },
      { source: deps.source, parallel: deps.parallel, referenceRecords: deps.referenceRecords, ...(deps.signal ? { signal: deps.signal } : {}) },
    );
    if (deps.signal?.aborted) return null;
    // A fighter with no template of its archetype would play as someone else's character: that's a finding.
    if (!cast.standIn.id.startsWith(TEMPLATE_ID_PREFIX) && results.template) {
      results.template = { ok: false, findings: [...results.template.findings, `there is no ${cast.sub.archetype.toLowerCase().replace("_", "-")} template on the roster, so it would play as ${cast.standIn.displayName}`] };
    }
    return await finish({ status: checksPassed(results) ? "PASSED" : "FAILED", results: results as unknown as Prisma.InputJsonValue });
  } catch (e) {
    if (deps.signal?.aborted) return null;
    return finish({ status: "ERROR", error: e instanceof CheckError ? e.message : `the checks stopped with an error: ${(e as Error).message}` });
  }
}

/**
 * The worker: looks at the queue every `everyMs`, runs one check at a time, and
 * stops when asked. `start()` first puts interrupted runs back in the queue.
 */
export function createCheckRunner(db: Db, deps: Omit<CheckRunnerDeps, "referenceRecords" | "signal">, options: { everyMs?: number; onError?: (e: unknown) => void; onDone?: (row: CheckRow) => void } = {}) {
  const abort = new AbortController();
  const referenceRecords = new Map<string, WinTally>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy: Promise<void> | null = null;
  const tick = () => {
    if (busy || abort.signal.aborted) return;
    busy = (async () => {
      for (;;) {
        const row = await runNextSubmissionCheck(db, { ...deps, referenceRecords, signal: abort.signal });
        if (!row || abort.signal.aborted) return;
        options.onDone?.(row);
      }
    })()
      .catch((e) => options.onError?.(e))
      .finally(() => {
        busy = null;
      });
  };
  return {
    async start(): Promise<void> {
      await requeueInterruptedChecks(db);
      timer = setInterval(tick, options.everyMs ?? 15_000);
      timer.unref?.();
      tick();
    },
    /** Look at the queue now (after queueing a run) instead of at the next tick. */
    poke: tick,
    async stop(): Promise<void> {
      clearInterval(timer);
      abort.abort();
      await busy;
    },
  };
}
