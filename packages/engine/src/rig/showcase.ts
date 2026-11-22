/** A fighter's poses worth showing people: stance, a jab, a high kick, a special, the sweep, a fall and a win. */
import type { TemplateSpec } from "../templates/spec.ts";
import type { Pose } from "./skeleton.ts";

const PICKS: readonly (readonly [number, number])[] = [[0, 0], [200, 2], [240, 2], [1000, 5], [1100, 3], [440, 5], [5050, 1], [181, 2]];

export function showcasePoses(spec: TemplateSpec & { rig: { poses: readonly Pose[] } }): Pose[] {
  return PICKS.map(([action, frame]) => {
    const a = spec.attacks.find((x) => x.state === action)?.anim ?? spec.anims.find((x) => x.action === action);
    const cells = a?.cells as number[] | undefined;
    const cell = cells?.[Math.min(frame, cells.length - 1)];
    if (cell === undefined) throw new Error(`no action ${action}`);
    return spec.rig.poses[cell]!;
  });
}
