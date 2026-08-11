import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Who this client says it is, in the one format the server will parse.
 *
 * `parseClientHeader` in @ekmool/contracts/headers accepts
 * `mobile/1.4.0 (android; build 41)` and returns null for anything else —
 * and null means "an ordinary browser", which costs the request the native
 * lane (past the Turnstile it cannot solve, into a tighter volume ceiling).
 * So every value below is either the real one or a deliberate, documented
 * fallback that still parses; a header that fails to parse is strictly worse
 * than one that admits it does not know.
 *
 * Read once at module load. The values cannot change while the process is
 * alive — they come out of the binary — and recomputing them per request
 * would put an `expo-constants` bridge read on the hot path for a string
 * that is a constant.
 */

/** `mobile`. The token the server matches to decide a request is native. */
const CLIENT_PLATFORM = "mobile";

/**
 * The marketing version from app.config.js, e.g. `1.0.0`.
 *
 * Forced to three numeric parts because the server's regex requires them.
 * A pre-release version like `1.1.0-beta.2` is a perfectly reasonable thing
 * for someone to write in app.config.js one day, and it would make this
 * header unparseable — which would show up as "the app is being rate-limited
 * like a browser" and be traced back to here after a long afternoon. Cheaper
 * to truncate to the numeric prefix and carry on.
 */
function readVersion(): string {
  const raw = Constants.expoConfig?.version ?? "";
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "0.0.0";
}

/**
 * The native build number: `ios.buildNumber` (CFBundleVersion) or
 * `android.versionCode`.
 *
 * `Constants.platform` is read first because it comes from the binary that
 * is actually running, and `Constants.expoConfig` second because it comes
 * from the manifest, which an OTA update can replace. For a version *gate*
 * the binary's own number is the only honest answer — the whole question
 * being asked is "is this app too old", and an updated manifest claiming a
 * newer build is exactly the wrong input.
 *
 * **Falls back to 0, and 0 fails every `minClientBuild` check.** That is the
 * safe direction the contract asks for (see `ClientIdentity.build`), but it
 * has a live consequence worth knowing: `apps/mobile/app.config.js` sets
 * neither `ios.buildNumber` nor `android.versionCode` today, so until it does
 * — or until EAS `autoIncrement` writes them at build time — this reports 0,
 * and a server with even the default `minClientBuild: 1` will consider every
 * build out of date. That is a config change in a file this module cannot
 * make on its own, not something to paper over here with an invented 1: a
 * client that claims a build number it does not have makes the version gate
 * unenforceable for everyone, which is the failure the gate exists to
 * prevent.
 */
function readBuild(): number {
  const native =
    Platform.OS === "ios"
      ? Constants.platform?.ios?.buildNumber
      : Constants.platform?.android?.versionCode;

  const configured =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;

  const value = Number(native ?? configured ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** The marketing version, three numeric parts. */
export const CLIENT_VERSION: string = readVersion();

/** The native build number, or 0 when the binary does not state one. */
export const CLIENT_BUILD: number = readBuild();

/**
 * The exact value of `X-Ekmool-Client`.
 *
 * `Platform.OS` rather than a constant, so a log line says which OS hit a
 * bug. The detail inside the parentheses is capped at 60 characters by the
 * server's regex; `android; build 41` is nowhere near it and nothing else
 * belongs in there — a device model would be, at best, an unnecessary
 * fingerprint attached to every request a customer makes.
 */
export const CLIENT_HEADER_VALUE = `${CLIENT_PLATFORM}/${CLIENT_VERSION} (${Platform.OS}; build ${CLIENT_BUILD})`;
