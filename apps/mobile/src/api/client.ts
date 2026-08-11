import { CLIENT_HEADER, INSTALL_HEADER } from "@ekmool/contracts/headers";
import { isApiErrorCode, type ApiErrorCode } from "@ekmool/contracts/errors";
import { bearerHeaderValue } from "@ekmool/contracts/session";
import { CLIENT_HEADER_VALUE } from "@/lib/client-info";
import { getInstallId } from "@/lib/install-id";
import { clearSession, loadSession } from "@/lib/session";

/**
 * The one place this app talks to a server.
 *
 * Three properties are load-bearing and each is written up where it is
 * implemented: an expected refusal is a value and not an exception; nothing
 * non-idempotent is ever retried; every request has a deadline.
 */

/* ------------------------------------------------------------------ */
/* Where the server is                                                 */

/**
 * The origin the deployed site is served from, used when
 * `EXPO_PUBLIC_API_URL` is unset.
 *
 * A fallback exists at all so that a build made without the variable talks to
 * production rather than to nothing — the failure mode of "no base URL" is
 * every screen empty with no explanation, which looks like an outage.
 *
 * It is **not** `http://localhost:3000`, and that is the trap this comment
 * exists to close. A phone is not the machine running `next dev`; on a device
 * `localhost` is the device itself, so a developer who leaves the variable
 * unset gets connection-refused on every request and a long detour looking
 * for the bug in this file. To point a real handset at a laptop, set
 * `EXPO_PUBLIC_API_URL` to that laptop's LAN address (`http://192.168.x.x:3000`)
 * — the simulator is the only place localhost works, and building the default
 * around the simulator would be building it around the one environment no
 * customer has.
 *
 * `docs/deploy.md` deploys to `ekmool.com`;
 * `docs/mobile/phase-6-release-engineering.md` shows `https://ekmool.in` in
 * its `eas.json` example. They disagree, and this constant follows deploy.md
 * because that is the origin the API is actually served from. Release builds
 * set `EXPO_PUBLIC_API_URL` explicitly and never reach this line.
 */
const FALLBACK_ORIGIN = "https://ekmool.com";

/**
 * `process.env.EXPO_PUBLIC_API_URL` is written out in full, once, here.
 *
 * It has to be a literal member expression: Expo's Babel transform
 * substitutes the value at build time by matching the source text, so
 * `process.env[name]` or a destructured copy compiles to a lookup on an
 * object that does not exist at runtime.
 *
 * **No other module in this app names a host.** Every path passed to the
 * functions below is origin-relative.
 */
export const API_BASE_URL: string = (
  // `||` rather than `??`: an env var set to the empty string is how a CI
  // config that forgot to interpolate a value arrives, and "" is not an
  // origin. `??` would accept it and produce request URLs like `/catalog/…`
  // with no host.
  process.env.EXPO_PUBLIC_API_URL || FALLBACK_ORIGIN
).replace(/\/+$/, "");

function url(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ------------------------------------------------------------------ */
/* The result                                                          */

/**
 * Failures that never came from a server, so they can never be one of the
 * 31 codes in `@ekmool/contracts/errors`.
 *
 * Widening the union is a deviation from the plan's `code: ApiErrorCode`, and
 * it is deliberate. The alternative was to report a phone in a tunnel as
 * `INTERNAL_ERROR` — a code whose documented meaning is "ours, not theirs" —
 * which would put "something went wrong on our side" in front of a customer
 * whose train is between stations. Copy has to be specific (rule: a refusal
 * names the rule that refused it), and it cannot be specific about a cause
 * the type has thrown away. `isApiErrorCode` still narrows the server's half
 * of the union, so the two can never be confused by accident.
 */
export type ClientErrorCode = "OFFLINE" | "TIMEOUT" | "CANCELLED";

export type ApiFailureCode = ApiErrorCode | ClientErrorCode;

export interface ApiFailure {
  ok: false;
  code: ApiFailureCode;
  /**
   * Display-ready, and normally the server's own `error` string — it already
   * names the rule that refused and knows thresholds this client does not
   * ("a basket of at least ₹500"). Composed here only where the server has
   * nothing usable to say: the transport codes above, and `RATE_LIMITED`,
   * whose server text is "Too many requests".
   */
  message: string;
  /** Seconds, on `RATE_LIMITED` only. */
  retryAfter?: number;
  /**
   * The parsed error body, for the codes that carry more than `{ error, code }`:
   * `INSUFFICIENT_STOCK` has `sku`/`available`, `COUPON_REFUSED` has `reason`,
   * `VALIDATION_FAILED` has `issues`. `unknown` because the shape depends on
   * the code and `@ekmool/contracts/responses` already declares each one —
   * narrow it there, at the call site that knows which code it asked about.
   */
  payload?: unknown;
}

/**
 * What every call returns. `INSUFFICIENT_STOCK` is not an exception, it is an
 * answer, and the screen that asked has to render it — so nothing here throws
 * for an expected refusal, and no caller needs a try/catch to be correct.
 */
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/* ------------------------------------------------------------------ */
/* Copy the server cannot write                                        */

/**
 * "Try again in about a minute", never "429" and never "Too many requests".
 *
 * The number is the server's `retryAfter`; only the sentence is ours. It is
 * ours because the server sends the same three words to a browser and to a
 * phone, and a customer who tapped once does not read "too many requests" as
 * being about anybody but themselves.
 */
export function retryAfterMessage(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 10) {
    return "Too many requests just now. Try again in a few seconds.";
  }
  if (seconds < 90) {
    return "Too many requests just now. Try again in about a minute.";
  }
  const minutes = Math.round(seconds / 60);
  return `Too many requests just now. Try again in about ${minutes} minutes.`;
}

const OFFLINE_MESSAGE =
  "No connection. Check your network and try again.";
const TIMEOUT_MESSAGE =
  "The connection is too slow to finish that. Try again when you have a better signal.";
const UNREADABLE_MESSAGE = "Something went wrong. Please try again.";

/* ------------------------------------------------------------------ */
/* Deadlines                                                           */

/** Enough for a cold Lambda plus a slow 4G handshake, and not a second more. */
export const DEFAULT_TIMEOUT_MS = 12_000;

/** Documents are larger; a catalogue on a bad connection deserves longer. */
export const DOCUMENT_TIMEOUT_MS = 20_000;

/**
 * Every request gets one of these. A fetch with no deadline on a bad 4G
 * connection does not fail — it hangs, and the screen that is waiting on it
 * hangs with it, forever, with a spinner that is telling the customer a lie.
 *
 * `AbortSignal.timeout` is the right primitive and is used when it exists.
 * React Native's `AbortController` comes from a polyfill that predates the
 * static method, and Hermes does not add it, so the feature test is not
 * ceremony — it is the difference between a timeout and a TypeError on a
 * customer's handset. The fallback is also the path taken whenever a caller
 * supplies its own signal, because composing two signals needs
 * `AbortSignal.any`, which is newer still.
 */
interface RequestDeadline {
  signal: AbortSignal;
  /** True when *we* aborted the request for being too slow. */
  timedOut(): boolean;
  dispose(): void;
}

function requestSignal(
  timeoutMs: number,
  external: AbortSignal | undefined,
): RequestDeadline {
  if (!external && typeof AbortSignal.timeout === "function") {
    // The native signal aborts with a `TimeoutError`, which `transportFailure`
    // reads off the error's name — hence `timedOut: false` here rather than a
    // second flag saying the same thing twice.
    return {
      signal: AbortSignal.timeout(timeoutMs),
      timedOut: () => false,
      dispose: () => {},
    };
  }

  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    // `abort()` with no reason, not `abort(new DOMException(…))`: Hermes does
    // not ship `DOMException`, and constructing one to label a timeout would
    // throw inside the timer, on the slow connection, where nothing is
    // watching. The flag carries the same information.
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };
  external?.addEventListener("abort", onExternalAbort);

  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Headers                                                             */

export interface ApiRequestOptions {
  /**
   * `PUT` is here for `PUT /api/account/wishlist`, which replaces the list
   * rather than merging into it — the only way a removal reaches the
   * account. Without it a slug taken off the list on the phone came back at
   * the next merge, which looks like the app ignoring the customer.
   *
   * It is deliberately NOT added to the retry rule below. A PUT is
   * idempotent by definition and could safely be retried, but the rule there
   * is written as "the shape of the request, not the caller's intention",
   * and widening it for a method nobody has needed to retry would trade a
   * real guarantee for a hypothetical convenience.
   */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serialised as JSON. Omit for a GET. */
  body?: unknown;
  /**
   * Required by `POST /api/checkout` — at least 8 characters. It is what
   * makes the order safe to retry at all; see the retry note below.
   */
  idempotencyKey?: string;
  timeoutMs?: number;
  /** A caller's own cancellation, e.g. a screen unmounting. */
  signal?: AbortSignal;
}

async function buildHeaders(options: ApiRequestOptions): Promise<Headers> {
  const headers = new Headers({
    accept: "application/json",
    [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
  });

  const installId = await getInstallId();
  if (installId) headers.set(INSTALL_HEADER, installId);

  const session = await loadSession();
  if (session) headers.set("authorization", bearerHeaderValue(session.token));

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }

  return headers;
}

/* ------------------------------------------------------------------ */
/* Reading a failure off the wire                                      */

/**
 * The code to use when the body did not carry a usable one — an nginx 502
 * page, a truncated response, a proxy that ate the JSON.
 *
 * Every entry is a code the server does send at that status, so a screen
 * switching on the union never sees a value that is not in it.
 */
function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401 || status === 403) return "NO_SESSION";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "VALIDATION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "DB_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toFailure(
  status: number,
  body: unknown,
  headers: Headers,
): ApiFailure {
  const record: Record<string, unknown> =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const code = isApiErrorCode(record.code) ? record.code : codeForStatus(status);
  const serverMessage =
    typeof record.error === "string" && record.error.length > 0
      ? record.error
      : undefined;

  if (code === "RATE_LIMITED") {
    // Body first, header second: proxy.ts sends both, and a CDN in front is
    // more likely to rewrite a header than a JSON field.
    const retryAfter =
      readNumber(record.retryAfter) ?? Number(headers.get("retry-after") ?? 60);
    return {
      ok: false,
      code,
      message: retryAfterMessage(retryAfter),
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
      payload: body,
    };
  }

  return {
    ok: false,
    code,
    message: serverMessage ?? UNREADABLE_MESSAGE,
    payload: body,
  };
}

function transportFailure(
  error: unknown,
  external: AbortSignal | undefined,
  deadline: RequestDeadline,
): ApiFailure {
  // The caller's own cancellation is checked first: an unmounting screen
  // aborts through the same AbortController a timeout does, and telling a
  // customer their connection is slow because they navigated away would be
  // an invented problem.
  if (external?.aborted) {
    return { ok: false, code: "CANCELLED", message: "Cancelled." };
  }
  const name = error instanceof Error ? error.name : "";
  if (deadline.timedOut() || name === "TimeoutError") {
    return { ok: false, code: "TIMEOUT", message: TIMEOUT_MESSAGE };
  }
  return { ok: false, code: "OFFLINE", message: OFFLINE_MESSAGE };
}

/* ------------------------------------------------------------------ */
/* The request                                                         */

async function attempt<T>(
  path: string,
  options: ApiRequestOptions,
): Promise<ApiResult<T>> {
  const method = options.method ?? "GET";
  const deadline = requestSignal(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.signal,
  );

  let response: Response;
  try {
    response = await fetch(url(path), {
      method,
      headers: await buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: deadline.signal,
    });
  } catch (error) {
    return transportFailure(error, options.signal, deadline);
  } finally {
    deadline.dispose();
  }

  // Read the body once, as text, and parse it here. `response.json()` throws
  // on an empty body and on the HTML error page a proxy can substitute, and
  // both of those are ordinary things for a phone to receive.
  let parsed: unknown;
  let raw = "";
  try {
    raw = await response.text();
    parsed = raw.length > 0 ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined;
  }

  if (response.status === 401) {
    // Clear, report, and **do not retry**. A retry against an expired token
    // is a loop: the second 401 is as certain as the first, and the only
    // thing it adds is another request from a customer who is already stuck.
    // The session's subscribers hear about the clear and the app returns to
    // the lookup screen; the caller gets the failure so the screen it is on
    // can stop waiting.
    await clearSession();
    const failure = toFailure(response.status, parsed, response.headers);
    return {
      ...failure,
      message:
        failure.message === UNREADABLE_MESSAGE
          ? "Your sign-in has expired. Look up your order again to continue."
          : failure.message,
    };
  }

  if (!response.ok) {
    return toFailure(response.status, parsed, response.headers);
  }

  if (response.status === 204 || raw.length === 0) {
    // A caller that types such a request as `ApiResult<void>` gets `undefined`
    // as its data, which is what `void` is. The double cast is the only way
    // to say that in a signature generic over an unconstrained T.
    return { ok: true, data: undefined as unknown as T };
  }

  if (parsed === undefined) {
    // A 200 whose body is not JSON is a broken deployment, not a refusal.
    return { ok: false, code: "INTERNAL_ERROR", message: UNREADABLE_MESSAGE };
  }

  return { ok: true, data: parsed as T };
}

/**
 * One request, with one narrow retry.
 *
 * **A GET may be retried once, and only after a transport failure.** Nothing
 * else is ever retried automatically, and the reason is checkout: a POST that
 * times out may well have been received, and a retry without the same
 * `Idempotency-Key` is a second order against the same customer's card. The
 * server does defend that specific case — a unique index on the key, and a
 * 200 with `replayed: true` — but the defence only works for a caller that
 * reuses the key, which a blind retry inside this function cannot promise
 * for every future POST somebody adds. So the rule is the shape of the
 * request, not the caller's intention: idempotent methods only.
 *
 * A retry after a 5xx is also excluded. A 500 from a handler has already run
 * whatever it ran; retrying it is the same gamble as retrying a POST, and it
 * is the caller's to take with a button the customer pressed.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const first = await attempt<T>(path, options);

  const method = options.method ?? "GET";
  const retryable =
    method === "GET" &&
    !first.ok &&
    (first.code === "OFFLINE" || first.code === "TIMEOUT") &&
    !options.signal?.aborted;

  if (!retryable) return first;

  return attempt<T>(path, options);
}

export function apiGet<T>(
  path: string,
  options: Omit<ApiRequestOptions, "method" | "body"> = {},
): Promise<ApiResult<T>> {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function apiPost<T>(
  path: string,
  body: unknown,
  options: Omit<ApiRequestOptions, "method" | "body"> = {},
): Promise<ApiResult<T>> {
  return apiRequest<T>(path, { ...options, method: "POST", body });
}

/* ------------------------------------------------------------------ */
/* The catalogue documents                                             */

/**
 * A conditional GET for one of the three static documents.
 *
 * Separate from `apiRequest` because these are files, not API calls: they
 * live under `/catalog/…` rather than `/api/…` (see the header comment in
 * `apps/web/src/app/catalog/v1.json/route.ts`), they are not rate limited,
 * they carry an ETag rather than an error envelope, and the caller wants the
 * body as text so it can be cached without a re-serialise.
 *
 * The install id is deliberately not sent. It buys fairness in a rate-limit
 * bucket, and `src/proxy.ts` only matches `/api/`, so on this path it would
 * be a keystore read per refresh that nothing reads. The client header stays,
 * because a log line saying which build fetched a bad document is worth the
 * nothing it costs.
 *
 * The status is returned rather than interpreted: the caller compares ETags
 * as well, for the reason written up in `useCachedDocument`.
 */
export type DocumentFetch =
  | { ok: true; status: 200; body: string; etag: string | null }
  | { ok: true; status: 304 }
  | ApiFailure;

export async function fetchDocument(
  path: string,
  etag: string | null,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<DocumentFetch> {
  const deadline = requestSignal(
    options.timeoutMs ?? DOCUMENT_TIMEOUT_MS,
    options.signal,
  );

  let response: Response;
  try {
    const headers = new Headers({
      accept: "application/json",
      [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
    });
    if (etag) headers.set("if-none-match", etag);

    response = await fetch(url(path), {
      method: "GET",
      headers,
      signal: deadline.signal,
    });
  } catch (error) {
    return transportFailure(error, options.signal, deadline);
  } finally {
    deadline.dispose();
  }

  if (response.status === 304) return { ok: true, status: 304 };

  if (!response.ok) {
    return toFailure(response.status, undefined, response.headers);
  }

  const body = await response.text();
  return { ok: true, status: 200, body, etag: response.headers.get("etag") };
}
