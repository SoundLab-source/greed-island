import { ALL_ROUNDER } from "./all-rounder.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import { JADE_SERPENT } from "./jade-serpent.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { ZONER } from "./zoner.ts";
import type { TemplateSpec } from "./spec.ts";

export * from "./spec.ts";
export { templateDefPath } from "./build.ts";

/** Every fighter template, one per archetype. */
export const TEMPLATES: readonly TemplateSpec[] = [ALL_ROUNDER, RUSHDOWN, HEAVY, GRAPPLER, ZONER];

/**
 * House fighters built the same way but not templates (communities don't draw
 * on them, and the checks don't use them): their own looks and styles, from
 * other free sprite sheets (art/SOURCES.md).
 */
export const HOUSE_FIGHTERS: readonly TemplateSpec[] = [JADE_SERPENT];

/** Everything `pnpm templates:build` builds. */
export const BUILT_FIGHTERS: readonly TemplateSpec[] = [...TEMPLATES, ...HOUSE_FIGHTERS];
