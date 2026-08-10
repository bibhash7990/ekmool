/**
 * Installs the `@/` resolve hook. Pass with `--import`, before the script:
 *
 *   node --conditions react-server --import ./scripts/register-alias.mjs \
 *        scripts/test-admin.mjs
 */
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
