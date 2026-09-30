/**
 * Where submitted images live: outside git, in GI_SUBMISSIONS_DIR (default
 * `submissions/` in the repo, gitignored), as <submission id>/<sha256>.png.
 * Paths are built only from the submission's id and the image's hash, never
 * from anything the submitter typed. Files stay on disk when removed from a
 * draft or when a submission is closed (a record of what was reviewed).
 */
import { REPO_ROOT } from "@greed-island/db";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class SubmissionStore {
  constructor(readonly dir: string) {}

  private file(submissionId: string, sha256: string): string {
    if (!UUID.test(submissionId) || !SHA256.test(sha256)) throw new Error("bad submission file reference");
    return path.join(this.dir, submissionId, `${sha256}.png`);
  }

  /** Store an image; returns its SHA-256. Storing the same image twice keeps one copy. */
  async save(submissionId: string, bytes: Uint8Array): Promise<string> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const target = this.file(submissionId, sha256);
    const exists = await stat(target).then(() => true, () => false);
    if (!exists) {
      await mkdir(path.dirname(target), { recursive: true });
      // Write then rename, so a crash never leaves half an image under its final name.
      const temp = `${target}.${randomUUID()}.tmp`;
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, target);
    }
    return sha256;
  }

  read(submissionId: string, sha256: string): Promise<Buffer> {
    return readFile(this.file(submissionId, sha256));
  }
}

/** GI_SUBMISSIONS_DIR, or `submissions/` in the repo. */
export function loadSubmissionStore(env: NodeJS.ProcessEnv = process.env): SubmissionStore {
  const dir = env["GI_SUBMISSIONS_DIR"]?.trim();
  return new SubmissionStore(dir ? path.resolve(dir) : path.join(REPO_ROOT, "submissions"));
}
