// `pnpm ikemen:install-mod`: copy ikemen/mods/salty_events.lua into $IKEMEN_DIR/external/mods/.
import { loadRepoEnv } from "@greed-island/db";
import { installMod } from "../ikemen/install.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
console.log(`Installed ${await installMod(ikemenDir)}`);
