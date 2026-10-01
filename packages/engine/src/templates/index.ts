import { ALL_ROUNDER } from "./all-rounder.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { ZONER } from "./zoner.ts";
import type { TemplateSpec } from "./spec.ts";

export * from "./spec.ts";
export { templateDefPath } from "./build.ts";

/** Every fighter template, one per archetype. */
export const TEMPLATES: readonly TemplateSpec[] = [ALL_ROUNDER, RUSHDOWN, HEAVY, GRAPPLER, ZONER];
