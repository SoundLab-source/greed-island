import { ALL_ROUNDER } from "./all-rounder.ts";
import { CRIMSON_MONGOOSE } from "./crimson-mongoose.ts";
import { GRAPPLER } from "./grappler.ts";
import { FERAL_LYNX } from "./feral-lynx.ts";
import { HEAVY } from "./heavy.ts";
import { HURRICANE_ORCHID } from "./hurricane-orchid.ts";
import { IRON_BISON } from "./iron-bison.ts";
import { JADE_SERPENT } from "./jade-serpent.ts";
import { NEON_GORILLA } from "./neon-gorilla.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { SAPPHIRE_MANTIS } from "./sapphire-mantis.ts";
import { SILVER_CRANE } from "./silver-crane.ts";
import { THUNDER_PEONY } from "./thunder-peony.ts";
import { VIOLET_HORNET } from "./violet-hornet.ts";
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
export const HOUSE_FIGHTERS: readonly TemplateSpec[] = [JADE_SERPENT, FERAL_LYNX, THUNDER_PEONY, HURRICANE_ORCHID, SILVER_CRANE, CRIMSON_MONGOOSE, IRON_BISON, NEON_GORILLA, VIOLET_HORNET, SAPPHIRE_MANTIS];

/** Everything `pnpm templates:build` builds. */
export const BUILT_FIGHTERS: readonly TemplateSpec[] = [...TEMPLATES, ...HOUSE_FIGHTERS];
