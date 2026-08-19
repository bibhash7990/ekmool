# The device checklist

**Run this before every release, on real hardware.** It is the Phase 4 exit
criterion that no suite can stand in for: `test:mobile-api` proves the server
answers correctly, and proves nothing at all about whether a person can place
an order.

Budget an hour. Most of it is the accessibility passes, and they are the part
most likely to find something.

---

## Before you start

Run it against a **`production-apk` or TestFlight build**, never a
development build and never a simulator. Three of the defects this document
exists to catch — the splash hang, R8 stripping a reflective call, and a
font failing to embed — exist only in a Release build.

```bash
cd apps/mobile
npx eas-cli@latest build --profile production-apk --platform android
```

Note the build number you tested. A checklist run that cannot be tied to an
artefact is an anecdote.

---

## 1. Launch — shared with the Phase 3 gate

Do this first and do not skip it because the app "obviously starts". See
[`release-gate.md`](release-gate.md) for why `expo/expo#47687` is invisible
until it is not.

- [ ] Ten cold launches, ten arrivals at the catalogue. **Not nine.**
      A real cold start is Force stop, not swiping out of recents:
      Settings → Apps → Ekmool → Force stop → tap the icon.
- [ ] Cold-start to first catalogue paint, recorded as a number

---

## 2. A Cash-on-Delivery order, end to end

The whole phase is this line working.

- [ ] Add two different products, change a quantity, remove one
- [ ] The cart total matches what the same basket shows on the website
- [ ] Apply a valid coupon — the discount appears
- [ ] **Move to checkout: the total is the same one the cart showed.** This
      is the bug that shipped once as `cartTotals(subtotal)` without the
      coupon adjustments, and it is invisible in any test that looks at one
      screen
- [ ] Enter a PIN code — the zone and delivery band appear
- [ ] Place the order
- [ ] The receipt shows a reference, and the back gesture does **not** walk
      back into the emptied cart
- [ ] **The order appears in `/admin` with the right total, items and
      address**, and the total matches the receipt
- [ ] The order appears under Orders in the app after signing in with the
      reference and email

## 3. The refusals

Each one has a screen state rather than an alert, and each has to be forced
to know it works. Forcing them is fiddly on purpose — that is what makes
them worth checking rather than assuming.

- [ ] **`INSUFFICIENT_STOCK`** — set a variant's stock to 1 in `/admin`, put
      2 in the basket. The screen names the real number left and offers to
      reduce
- [ ] **`COUPON_REFUSED`** — a minimum-spend code under its threshold. The
      sentence names the rule (*"That code needs a basket of at least
      ₹500"*), and the order can still be placed without the code
- [ ] **`RATE_LIMITED`** — place four orders in an hour from one install.
      The fourth is refused with the wait in words. This also proves the
      native ceiling that the app pays for skipping the browser challenge
- [ ] **`DB_UNAVAILABLE`** — `docker compose stop mysql`, then place an
      order. The copy must include *"Nothing has been charged."*
- [ ] **Offline** — airplane mode. Place Order is disabled with a visible
      reason, and there is no queue pretending the order exists

## 4. Offline behaviour

- [ ] Airplane mode → Force stop → launch. **The catalogue still renders**
- [ ] Search works offline
- [ ] The cart survives a Force stop

## 5. Accessibility — exit criteria, not nice-to-haves

Rule 11 says accessibility stays at 100, and the web's gate is 100 rather
than 95 because it has caught real defects. Lighthouse cannot run here, so
the gate is a person with a screen reader.

**TalkBack** (Android: Settings → Accessibility → TalkBack), over
add-to-cart → checkout → receipt:

- [ ] Every control announces what it is and what it does
- [ ] The save-to-list control announces its **state**, and the change is
      announced when it changes — a name that changes silently under the
      press that changed it is not read again by every screen reader
- [ ] Every checkout input announces its label. A placeholder is not a label
- [ ] An error is announced next to its field, not only as a summary
- [ ] The whole purchase can be completed without sight

**VoiceOver** (iOS): the same list. It needs an iPhone, and it is a separate
sitting.

**200% text scale** (Settings → Display → Font size, largest):

- [ ] The checkout form is usable — nothing clipped, nothing overlapping,
      every field reachable and every button tappable
- [ ] The cart totals stay legible

## 6. Typography and polish

- [ ] Headings render in the serif (Marcellus), not Android's Roboto. A
      silent fallback here is the one failure a screenshot catches and a
      test does not
- [ ] Tapping into a product and back feels immediate
- [ ] No red screen anywhere

---

## Not covered yet

**Razorpay.** Deferred with COD-only, so there is no UPI round trip to test.
When it arrives this checklist gains the item the plan already specifies: a
completed UPI payment *and* an abandoned one, both leaving the order in the
correct state, with decision D4 recorded against what was observed. The
abandoned case is the one that matters — the customer leaves for their UPI
app and may not come back.

**Automated UI testing.** Maestro or similar is a real tool and a real cost;
the flows should stabilise first. Recorded so it is a decision rather than an
omission.

---

## Recording a run

Append the build number, the date, and anything that failed. A checklist
with no history cannot tell you whether something regressed or was never
right.

| Build | Date | Result |
|---|---|---|
| _(none yet)_ | | |

---

## Related

[Phase 3 release gate](release-gate.md) · [Phase 4](phase-4-commerce-flows.md) ·
[`pending.md`](../../pending.md)
