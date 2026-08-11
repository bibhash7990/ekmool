import type { CartItem } from "@ekmool/core/cart";
import type { OrderStatus, PaymentStatus } from "@ekmool/core/order-status";

import { API_BASE_URL, apiGet, apiPost, type ApiResult } from "@/api/client";

/**
 * Everything the account screens ask the server for.
 *
 * One module rather than one per screen, because every call here shares the
 * same property and it is easier to keep true in one file: **nothing takes an
 * email, a customer id or an address owner as an argument.** The bearer token
 * `src/api/client.ts` attaches carries the verified address, and
 * `getCustomerEmail(request.headers)` on the server is the only thing that
 * decides whose rows come back. docs/SECURITY.md: "Scope every read to the
 * session, never to a parameter." A function here that accepted an email
 * would be a parameter, however carefully the caller filled it in.
 *
 * Every function returns `ApiResult<T>`. A refusal is a value, not an
 * exception — see the header of `src/api/client.ts` — so no screen below
 * needs a try/catch to be correct.
 *
 * **The shapes below were read off the route handlers, not off the plan**,
 * and where the two disagree the handler won and the disagreement is written
 * down at the spot. `docs/mobile/phase-4-commerce-flows.md` §4 says re-order
 * is a POST; it is a GET, and a GET that mutates nothing (see `reorder`).
 */

/* ------------------------------------------------------------------ */
/* GET /api/account/orders                                             */

/**
 * One row of the order history.
 *
 * `createdAt` is an ISO string, not a `Date`: it crossed JSON to get here.
 * Parsing it is the caller's job and happens once, in the list's formatter,
 * so that a malformed date from a bad deploy is a visibly wrong date rather
 * than a thrown error inside a `FlatList` row.
 */
export interface AccountOrderSummary {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  itemCount: number;
  createdAt: string;
}

interface AccountOrdersResponse {
  orders: AccountOrderSummary[];
}

/**
 * The signed-in customer's orders, newest first.
 *
 * Session-scoped by the email inside the token. There is deliberately no
 * `email` parameter and no `customerId` one; adding either would move the
 * decision about whose orders these are from a signature the server made to
 * a string this process typed.
 */
export async function listAccountOrders(options: {
  signal?: AbortSignal;
} = {}): Promise<ApiResult<AccountOrderSummary[]>> {
  const result = await apiGet<AccountOrdersResponse>("/api/account/orders", {
    signal: options.signal,
  });
  if (!result.ok) return result;
  // Defensive rather than trusting: a deployment where the route is missing
  // answers 200 with an HTML shell on some hosts, and `data.orders` is then
  // undefined. An empty list is the honest reading of "the server did not
  // send me any", and the screen already has copy for it.
  return { ok: true, data: result.data?.orders ?? [] };
}

/* ------------------------------------------------------------------ */
/* GET /api/orders/[id]                                                */

/** One line of an order, exactly as `GET /api/orders/[id]` serialises it. */
export interface OrderDetailItem {
  sku: string;
  productSlug: string;
  productName: string;
  packSizeLabel: string;
  unitPricePaise: number;
  qty: number;
  lineTotalPaise: number;
  discountPaise: number;
  hsnCode: string | null;
  gstRateBps: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * One order, as the API sends it.
 *
 * **This is deliberately less than the order page on the web shows.** The
 * handler omits the street address and the phone number, and sends only the
 * first name, because the ULID in a shared link is the only credential the
 * route asks for — so a link forwarded to the wrong person must not hand
 * over more than that person could already read off the parcel. `deliverTo`
 * is city, state and PIN and nothing else, and the mobile screen renders
 * exactly that rather than inventing the rest.
 *
 * `couponCode` and a top-level `discountPaise` are **not** in this response
 * even though the underlying row has both. The per-line `discountPaise` is,
 * so the screen shows the discount where the server put it.
 */
export interface OrderDetail {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "cod" | "razorpay";
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  trackingId: string | null;
  /** ISO. */
  createdAt: string;
  customerFirstName: string;
  deliverTo: {
    city: string;
    state: string;
    pincode: string;
  };
  items: OrderDetailItem[];
}

export function getOrder(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<OrderDetail>> {
  return apiGet<OrderDetail>(`/api/orders/${encodeURIComponent(id)}`, {
    signal: options.signal,
  });
}

/* ------------------------------------------------------------------ */
/* POST /api/orders/[id]/cancel                                        */

export interface CancelOrderResult {
  ok: true;
  orderId: string;
  /** Units put back on the shelf. Reporting only; nothing renders it. */
  restored: number;
}

/**
 * Cancels an order the session owns.
 *
 * Reading an order needs only its ULID; cancelling needs a session whose
 * verified email matches it, because it is destructive and it restores
 * stock. Without one the route answers 401 `VERIFICATION_REQUIRED`, and the
 * client's 401 handling clears the keystore and returns the app to the door.
 *
 * The body is empty on purpose — the route reads the id from the path and
 * the identity from the header, and there is nothing else it will accept.
 */
export function cancelOrder(id: string): Promise<ApiResult<CancelOrderResult>> {
  return apiPost<CancelOrderResult>(
    `/api/orders/${encodeURIComponent(id)}/cancel`,
    {},
  );
}

/* ------------------------------------------------------------------ */
/* POST /api/orders/[id]/return                                        */

/**
 * The four reasons `POST /api/orders/[id]/return` accepts, with the windows
 * and the caveats /refund-policy states.
 *
 * **This is a copy, and the copy is a known risk.** The list lives in
 * `apps/web/src/db/queries/returns.ts`, which imports `server-only` and
 * `mysql2` and so cannot be imported from a phone; there is no shared
 * package holding it, and creating one is not in this change's scope. The
 * drift is bounded rather than ignored: the server validates with `z.enum`
 * over its own list, so a value this file still offers after the server drops
 * it is refused with the server's own message rather than silently accepted.
 * What the phone can get wrong is offering a reason that no longer exists or
 * missing one that has been added.
 *
 * **The fix, when someone has the budget: move `RETURN_REASONS` into
 * `@ekmool/core` and import it here**, exactly as `order-status.ts` was moved
 * so the two clients could not name a status differently.
 */
export const RETURN_REASON_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  windowHours: number;
  help: string;
}> = [
  {
    value: "damaged",
    label: "It arrived damaged",
    windowHours: 48,
    help: "Leaking, crushed or a broken seal. Photographs help — reply to your confirmation email with them.",
  },
  {
    value: "wrong_item",
    label: "The wrong item arrived",
    windowHours: 48,
    help: "A different product or a different pack size from what you ordered.",
  },
  {
    value: "missing_item",
    label: "Something was missing",
    windowHours: 48,
    help: "Part of the order was not in the parcel.",
  },
  {
    value: "unopened_change_of_mind",
    label: "I changed my mind — the pack is unopened",
    windowHours: 24 * 7,
    help: "Only sealed, unopened packs. Return postage is at your cost and the original shipping is not refunded. Opened food cannot be resold, so it cannot be taken back.",
  },
];

export interface ReturnRequestResult {
  ok: true;
  id: number;
}

/**
 * Opens a return. 201 on success; every refusal carries the server's own
 * sentence, including the window arithmetic ("Change-of-mind returns close 7
 * days after delivery"), which this client does not have the delivery date
 * to compute and must not try to.
 */
export function requestReturn(
  id: string,
  reason: string,
  detail: string,
): Promise<ApiResult<ReturnRequestResult>> {
  return apiPost<ReturnRequestResult>(
    `/api/orders/${encodeURIComponent(id)}/return`,
    { reason, detail },
  );
}

/* ------------------------------------------------------------------ */
/* GET /api/orders/[id]/reorder                                        */

/** A cart line the server priced today, plus why it may be smaller. */
export interface ReorderLine extends CartItem {
  /** The original quantity, when stock forced a smaller one. Null otherwise. */
  reducedFrom: number | null;
}

export interface ReorderQuote {
  available: ReorderLine[];
  unavailable: { label: string; reason: string }[];
}

/**
 * What a re-order of this order would put in the basket, priced today.
 *
 * **A GET, and the plan says POST.** The handler is `export async function
 * GET`, it opens no transaction and it writes nothing — it reads the old
 * lines, joins today's variants and answers with two lists. The client adds
 * them to the local cart. Calling it with POST would 405.
 *
 * That also makes it safe under the one automatic retry in `apiRequest`,
 * which is restricted to GETs precisely because a retried POST can place a
 * second order.
 *
 * Prices come from `product_variants` as it stands now, never from the old
 * order — charging last year's price is not a favour anyone asked for — and
 * a line that cannot come along is named rather than dropped.
 */
export function getReorderQuote(
  id: string,
): Promise<ApiResult<ReorderQuote>> {
  return apiGet<ReorderQuote>(`/api/orders/${encodeURIComponent(id)}/reorder`);
}

/* ------------------------------------------------------------------ */
/* The invoice                                                         */

/**
 * The absolute URL of an order's invoice, for `expo-web-browser`.
 *
 * **The invoice is not rendered natively, and that is the whole point.** It
 * is a print surface with a legal shape: a tax invoice when a real GSTIN is
 * configured, and a pro-forma with an explicit "this is not a tax invoice"
 * heading when one is not — and on a pro-forma the GST columns are not
 * merely blank, they are absent, because a column of dashes invites a reader
 * to look for tax that was never charged. Reimplementing that in React
 * Native means two invoice layouts that have to stay identical for ever, one
 * of which is a document a customer may hand to their own accountant. The
 * failure being avoided is the two drifting, and the only reliable way to
 * avoid it is to have one.
 *
 * No session is needed to open it. The route asks for the ULID and nothing
 * else, exactly like `GET /api/orders/[id]`, so the Custom Tab / Safari view
 * not carrying the bearer token costs nothing here.
 */
export function invoiceUrl(orderId: string): string {
  return `${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/invoice`;
}

/* ------------------------------------------------------------------ */
/* GET / POST /api/account/addresses                                   */

/** A saved address, as `apps/web/src/db/queries/customers.ts` shapes one. */
export interface SavedAddress {
  id: number;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  isDefault: boolean;
}

export interface AddressesResponse {
  addresses: SavedAddress[];
}

/** 201 from the POST: the new row's id, and the book as it now stands. */
export interface AddressCreatedResponse extends AddressesResponse {
  id: number;
}

/**
 * What the app may send.
 *
 * **There is no owner field here and there must not be one.** No
 * `customerId`, no email. The route resolves the customer from the session
 * through `getCustomerEmail(request.headers)` and the queries put
 * `customer_id` in every `WHERE`, which is what makes "you can only touch
 * your own" a property of the query rather than of this client behaving.
 *
 * There is also **no `id`**, because the route is create-only — see
 * `createAddress` below. Sending one would be silently dropped by
 * `savedAddressSchema`, which is the worst kind of ignored: a screen that
 * thought it was editing would be adding.
 */
export interface SavedAddressInput {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault?: boolean;
}

export function listAddresses(options: { signal?: AbortSignal } = {}): Promise<
  ApiResult<AddressesResponse>
> {
  return apiGet<AddressesResponse>("/api/account/addresses", {
    signal: options.signal,
  });
}

/**
 * Adds one address and returns the book as it now stands.
 *
 * **Create only. There is no edit, no delete and no set-default over this
 * route**, and that is the route's own stated decision rather than an
 * omission this client should work around: the web edits addresses through
 * server actions, which a native client cannot call, and a route nobody
 * calls is a surface nobody is testing. The address screen says where those
 * three can be done instead.
 *
 * The reply is the whole list rather than the one row, so the screen never
 * merges a server answer into local state and cannot end up showing two
 * defaults: `createAddress` makes the first address saved the default
 * whether or not it was asked for, and saving one with `isDefault` clears
 * the flag on another row. Reproducing those two rules on the client would
 * be a second copy of them.
 */
export function createAddress(
  input: SavedAddressInput,
): Promise<ApiResult<AddressCreatedResponse>> {
  return apiPost<AddressCreatedResponse>("/api/account/addresses", input);
}

/* ------------------------------------------------------------------ */
/* GET /api/account/export, POST /api/account/erase                    */

/**
 * Everything held against the signed-in address, as the server serialises
 * it. `unknown` rather than a declared shape on purpose: this is a DPDP
 * s.11 access request, the point of which is to hand over the rows
 * themselves. Typing it here would invite this client to summarise, filter
 * or re-order them, and a summarised access request is not one.
 */
export function exportAccountData(): Promise<ApiResult<unknown>> {
  return apiGet<unknown>("/api/account/export");
}

export interface EraseResult {
  ok: true;
  /** The server's own sentence about what survived. Rendered verbatim. */
  message: string;
}

/**
 * DPDP s.12 erasure.
 *
 * The body must carry the exact word `ERASE`. That is the server's guard and
 * this function does not soften it: the caller passes what the customer
 * typed, and a mistyped confirmation comes back as a refusal from the
 * server rather than being quietly corrected here. A confirmation the client
 * can supply on the customer's behalf is not a confirmation.
 */
export function eraseAccount(
  confirm: string,
): Promise<ApiResult<EraseResult>> {
  return apiPost<EraseResult>("/api/account/erase", { confirm });
}
