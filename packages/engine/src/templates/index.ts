import { ALL_ROUNDER } from "./all-rounder.ts";
import { AMETHYST_JAGUAR } from "./amethyst-jaguar.ts";
import { BRONZE_MONKEY } from "./bronze-monkey.ts";
import { COPPER_TIGER } from "./copper-tiger.ts";
import { CRIMSON_MONGOOSE } from "./crimson-mongoose.ts";
import { ELDER_TORTOISE } from "./elder-tortoise.ts";
import { FERAL_LYNX } from "./feral-lynx.ts";
import { GAMMA_GECKO } from "./gamma-gecko.ts";
import { GRANITE_RHINO } from "./granite-rhino.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import { HURRICANE_ORCHID } from "./hurricane-orchid.ts";
import { IRON_BISON } from "./iron-bison.ts";
import { JADE_SERPENT } from "./jade-serpent.ts";
import { MIDLIFE_CRISIS } from "./midlife-crisis.ts";
import { MOSS_WOLF } from "./moss-wolf.ts";
import { NAPOLEON_COMPLEX } from "./napoleon-complex.ts";
import { NEON_GORILLA } from "./neon-gorilla.ts";
import { CAMO_COBRA } from "./camo-cobra.ts";
import { DOGS } from "./dogs.ts";
import { HEROES } from "./hero-fighters.ts";
import { THAI_BOXERS } from "./thai-boxers.ts";
import { COOKIE_DO } from "./cookie-do.ts";
import { CHAINS } from "./chains.ts";
import { FARMERS } from "./farmers.ts";
import { MILITARY } from "./military.ts";
import { ALPHA } from "./alpha.ts";
import { EMERALD_VIPER } from "./emerald-viper.ts";
import { GINGER_FERRET } from "./ginger-ferret.ts";
import { IVORY_SWAN } from "./ivory-swan.ts";
import { JUNGLE_PYTHON } from "./jungle-python.ts";
import { TAWNY_COYOTE } from "./tawny-coyote.ts";
import { NYAN_CAT } from "./nyan-cat.ts";
import { OLIVE_BADGER } from "./olive-badger.ts";
import { RUBY_LIONESS } from "./ruby-lioness.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { SCARLET_HAWK } from "./scarlet-hawk.ts";
import { RUSSET_FOX } from "./russet-fox.ts";
import { SAPPHIRE_MANTIS } from "./sapphire-mantis.ts";
import { SILVER_CRANE } from "./silver-crane.ts";
import { SLATE_FALCON } from "./slate-falcon.ts";
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
export const HOUSE_FIGHTERS: readonly TemplateSpec[] = [JADE_SERPENT, FERAL_LYNX, THUNDER_PEONY, HURRICANE_ORCHID, SILVER_CRANE, CRIMSON_MONGOOSE, IRON_BISON, NEON_GORILLA, VIOLET_HORNET, SAPPHIRE_MANTIS, COPPER_TIGER, RUSSET_FOX, GRANITE_RHINO, AMETHYST_JAGUAR, SLATE_FALCON, BRONZE_MONKEY, MOSS_WOLF, OLIVE_BADGER, ELDER_TORTOISE, GAMMA_GECKO, RUBY_LIONESS, SCARLET_HAWK, MIDLIFE_CRISIS, NAPOLEON_COMPLEX, NYAN_CAT, CAMO_COBRA, JUNGLE_PYTHON, IVORY_SWAN, EMERALD_VIPER, TAWNY_COYOTE, GINGER_FERRET, ...DOGS, ...HEROES, ...THAI_BOXERS, ...COOKIE_DO, ...CHAINS, ...FARMERS, ...MILITARY, ...ALPHA];

/** Everything `pnpm templates:build` builds. */
export const BUILT_FIGHTERS: readonly TemplateSpec[] = [...TEMPLATES, ...HOUSE_FIGHTERS];
