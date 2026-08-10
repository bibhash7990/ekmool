# Phase 4 — Commerce flows

**Deliverable:** the app can sell. Cart to Cash-on-Delivery order to a
receipt, online payment where a key exists, order tracking, the account
area, wishlist and reviews.

**The rule that governs the whole phase:** the server is the authority on
every number. The app displays; it never decides. `docs/SECURITY.md`:
*"Never trust a client-sent price, discount or total. The checkout
transaction recomputes everything from rows it holds a lock on. The cart
sends variant ids and quantities; a coupon sends its code and nothing
else."* The phone is a client like any other.

---

## 1. Cart

The RTK slice from `@ekmool/core` is already wired. What this phase adds is
the screen and the arithmetic display.

- Line totals, subtotal, GST and delivery all come from `@ekmool/core`, the
  same functions the web calls. There is no `Intl.NumberFormat` in
  `apps/mobile/`; there is `formatPaise`.
- **The displayed total is provisional and must not pretend otherwise.**
  Checkout recomputes from locked rows, and the design system says *"say
  what happens next"*. The cart shows the arithmetic it can do honestly and
  the checkout screen shows the server's answer.
- Stock: the cached catalogue is up to an hour stale. Quantity steppers cap
  at the cached `stockQty` as a courtesy, not as a guarantee, and the
  refusal that matters arrives from `/api/checkout` as `INSUFFICIENT_STOCK`
  with the real number.
- 44×44 on every stepper control. A `−` button that is 32px is the most
  common accessibility failure in a mobile cart.

### The coupon field

`POST /api/coupons/preview` before checkout, exactly as the web does. On
refusal, render `couponRefusalMessage(reason, …)` from `@ekmool/core` —
*"That code needs a basket of at least ₹500"*, not *"Invalid code"*. The
sentence is composed on the shared side so the two clients cannot say
different things about the same rule.

---

## 2. Checkout

### Guest, and only guest

There is no sign-in step, no "continue as guest" button, no account
creation offered at the end. Rule 7, and the phrasing matters: a "continue
as guest" button tells a customer an account exists that they are declining,
which is not true here.

A returning customer with a session gets their saved addresses prefilled —
that is a convenience the session already earns. A customer without one
types their address, and nothing about the flow suggests they should have
done otherwise.

### The form

Fields and validation come from `@ekmool/contracts` — the same Zod schemas
the server enforces. The client validates for the message; the server
validates for the decision. Never widen a client schema to make a keyboard
easier.

Accessibility, non-negotiable and different from the web in mechanism only:

- **Every input has a visible label.** A placeholder is not a label; it
  disappears exactly when the user needs it. React Native makes floating-
  label patterns tempting; the design system's answer is already no.
- Errors sit next to the field, not only in a summary.
- `keyboardType="phone-pad"` for phone, `"number-pad"` for PIN,
  `autoComplete` and `textContentType` set so the platform can fill them.
- `react-native-keyboard-controller` is **not** taken in this phase. Try
  `KeyboardAvoidingView` plus a scroll container first; take the dependency
  only if that measurably fails, and say what failed.

### PIN serviceability

`GET /api/serviceability` on a debounced six-digit entry, showing the zone
and the delivery band. This is a live call, not cached — it is cheap, and a
stale delivery estimate is a promise the shop then breaks.

If it fails, checkout continues. A delivery estimate is information; it is
not a gate.

### Placing the order

```
POST /api/checkout
Idempotency-Key: <ULID generated once per checkout attempt>
```

The key is generated when the customer first taps Place Order and **held for
that attempt**, so a retry after a timeout returns the original order rather
than creating a second one. The endpoint already answers a replay with
`200` and `replayed: true`; the app treats that as success without comment.
It is a technical detail, not something to tell a customer.

Every documented refusal gets a screen state, not a generic alert:

| Code | What the customer sees |
|---|---|
| `INSUFFICIENT_STOCK` | The item, the real number left, and a control to reduce the quantity |
| `COUPON_REFUSED` | The composed sentence naming the rule, and the order can still be placed without the code |
| `UNKNOWN_VARIANT` | The line, and a control to remove it |
| `RAZORPAY_NOT_CONFIGURED` | Should never reach a customer — bootstrap already hid the option. If it does, fall back to COD in place, and log it. |
| `DB_UNAVAILABLE` | *"Nothing has been charged."* The server's own words, which are correct and are already written |
| `RATE_LIMITED` | The wait, in words |
| `VALIDATION_FAILED` | Field-level errors mapped back onto the inputs by `issues[].path` |

### Offline

The Place Order button is **disabled with a visible reason** when there is
no connection. No optimistic queue. `src/lib/offline-queue.ts` exists for
the web, and replicating it here would mean a customer believing an order
exists on a device that might not be opened for two days. Say "you are
offline — this needs a connection" and mean it.

---

## 3. Payment

### Cash on Delivery is the default and always works

Zero keys configured, COD still sells. This is the contract and it is tested
by removing the key, not by reasoning about it.

### Razorpay (D4)

`react-native-razorpay@3.0.0`. The flow:

1. `POST /api/checkout` with `paymentMethod: "razorpay"` returns
   `razorpayOrderId` and `razorpayKeyId`.
2. Open the native checkout with those.
3. **The webhook is the authority, not the SDK callback.** `POST
   /api/payment/webhook` verifies the signature before parsing the body, and
   `orders.razorpay_payment_id` is uniquely indexed so a replay cannot
   record a second payment. The SDK's success callback is a *hint that the
   customer got back*; the app then polls `GET /api/orders/[id]` until the
   status settles.
4. A cancelled or failed payment leaves an order in its pre-payment state,
   which the existing `cancel-stale-orders` job already handles. The app
   must not try to clean it up.

The UPI round trip is the risk: the customer leaves for their UPI app and
comes back. Test on real hardware, on a real UPI app, on both a successful
and an abandoned payment. **This is the measurement that decides whether D4
stands** — if the return path is unreliable, the reversal is Standard
Checkout in `expo-web-browser`, and the webhook already makes the server
correct either way.

The honest note that must be in the code: `hasRazorpay` controls whether the
option is shown. It does not control whether the native SDK is in the
binary. It always is. On the web the byte cost of an unconfigured
integration is zero; on a phone it is not, and pretending otherwise in a
comment would be exactly the kind of small lie this codebase does not tell.

---

## 4. Orders, tracking and the account

### Getting in

`POST /api/v1/session` with the eight-character reference and the email —
the same door as `/track`, the same wording, the same single failure message
for a wrong reference and a wrong email. Token to `expo-secure-store`.

### Screens

| Screen | Endpoint | Notes |
|---|---|---|
| Orders list | `GET /api/account/orders` | Session-scoped by email inside the token, never by a parameter. FlashList — this list is unbounded. |
| Order detail | `GET /api/orders/[id]` | Status vocabulary from `@ekmool/core/order-status`, so the two clients name the same state the same way |
| Cancel | `POST /api/orders/[id]/cancel` | Confirmation first; it is irreversible |
| Return | `POST /api/orders/[id]/return` | |
| Re-order | `POST /api/orders/[id]/reorder` | Populates the cart, then the cart screen |
| Invoice | `/orders/[id]/invoice` | **Opened in the browser via `expo-web-browser`, not rendered natively.** It is a print surface with a legal shape, including the pro-forma heading when no GSTIN is configured. Reimplementing it natively means two invoice layouts that must stay identical, one of which is a tax document. |
| Addresses | `GET/POST /api/account/*` | Queries scope on `customer_id` server-side; the app sends ids and nothing else |
| Privacy | `/api/account/export`, `/api/account/erase` | DPDP obligations. Export downloads; erase requires an explicit typed confirmation, and the copy says plainly that orders are anonymised rather than deleted because they are financial records — the same truth the web tells |

### Status copy

*"Waiting to be sent" beats "Thank you for your order" when the order has
not been sent.* The web already has this vocabulary in
`order-status.ts`; the app imports it rather than writing its own strings,
which is the mechanism that stops the two drifting.

---

## 5. Wishlist and reviews

**Wishlist** — `GET/POST /api/account/wishlist`, session-scoped. Without a
session it is local-only on the device, with copy saying so. Do not offer to
"save your wishlist" as a reason to identify; that is registration with
extra steps.

**Reviews** — read from `reviews-v1.json` (cached, tag-purged). Write with
`POST /api/reviews`. A product with no reviews shows **nothing** — no
heading, no grey stars, no "Be the first to review". Rule 5, and the web's
`test:home` asserts both directions of exactly this; the app's version of
that assertion is a screenshot test or a manual checklist item, and it must
exist in some form.

`ReviewComposer` is behind a button on the web because almost nobody clicks
it, and `next/dynamic` keeps it out of the bundle. The phone's equivalent is
a separate route — `expo-router` splits by route, so a screen nobody visits
is a screen nobody parses.

---

## 6. Testing

The web suites cover the server. This phase needs evidence for the client.

- **Extend `test:mobile-api`** with the flows this phase uses end to end
  against a live server: bearer checkout with an idempotency key, a replayed
  key returning the same order, a coupon refusal, a stock refusal, and
  session scoping from the bearer door.
- **A manual device checklist**, committed as
  `docs/mobile/device-checklist.md`, run before every release: COD order end
  to end on real hardware, a Razorpay UPI order and an abandoned one, offline
  behaviour, TalkBack over the purchase flow, VoiceOver over the same, and
  200% text scaling on the checkout form.
- **TalkBack and VoiceOver passes are exit criteria, not nice-to-haves.**
  Rule 11 says accessibility stays at 100 and the audit gate is 100 rather
  than 95 because it has caught real defects. Lighthouse cannot run here, so
  the gate becomes a person with a screen reader and a checklist.

Automated UI testing (Maestro or similar) is **not** taken in this phase. It
is a real tool and a real cost; the flows should stabilise first. Record the
intention so it is a decision rather than an omission.

---

## Exit criteria

- [ ] A COD order placed from a Release build on physical Android hardware,
      appearing correctly in `/admin`
- [ ] The same on physical iOS hardware via TestFlight
- [ ] A Razorpay UPI payment completed, and an abandoned one, both leaving
      the order in the correct state — **the D4 decision recorded with what
      was observed**
- [ ] A replayed `Idempotency-Key` produces one order, verified in the
      database
- [ ] Every refusal code in §2 rendered as a real screen state, verified by
      forcing each
- [ ] The app sells with **every** third-party key removed
- [ ] TalkBack and VoiceOver passes over add-to-cart → checkout → receipt
- [ ] Checkout form usable at 200% text scale
- [ ] No hardcoded price, GST rate or delivery band in `apps/mobile/`
- [ ] `test:mobile-api` extended and green; every existing web suite green
- [ ] `docs/mobile/device-checklist.md` written and run once end to end

---

## Related

[Programme index](README.md) · [← Phase 3](phase-3-app-foundation.md) ·
[Phase 5 →](phase-5-size-and-performance.md) ·
[`docs/SECURITY.md`](../SECURITY.md) ·
[`docs/DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md)
