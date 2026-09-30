import { ALL_ROUNDER } from "./all-rounder.ts";
import type { TemplateSpec } from "./spec.ts";

export * from "./spec.ts";
export { templateDefPath } from "./build.ts";

/** Every fighter template, one per archetype as they're built. */
export const TEMPLATES: readonly TemplateSpec[] = [ALL_ROUNDER];
