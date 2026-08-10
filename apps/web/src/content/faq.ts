/**
 * Site-wide FAQ. This array is the single source for both the visible
 * accordion and the FAQPage structured data, so they cannot drift apart.
 */

export interface FaqGroup {
  heading: string;
  items: { question: string; answer: string }[];
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    heading: "Ordering & payment",
    items: [
      {
        question: "Do I need an account to order?",
        answer:
          "No. Checkout is guest-first — you enter a delivery address and a contact number and that is it. We do not ask you to create a password, and we do not make you sign in to see your own order: the confirmation link we email you works on its own.",
      },
      {
        question: "Is Cash on Delivery available?",
        answer:
          "Yes, everywhere we ship in India, on every order. You pay the courier when the parcel reaches you. If you prefer to pay upfront we also accept UPI, cards, net banking and wallets through Razorpay, which is a PCI-DSS compliant payment gateway — we never see or store your card details.",
      },
      {
        question: "Can I change or cancel my order after placing it?",
        answer:
          "If it has not shipped yet, almost certainly. Write to us from the contact page with your order reference as soon as you can. Once a parcel is handed to the courier we cannot recall it, but you can still refuse delivery, and for a Cash on Delivery order that costs you nothing.",
      },
      {
        question: "Do your prices include GST?",
        answer:
          "Yes. Every price shown on the site is the final amount inclusive of all taxes. Shipping is the only thing added at checkout, and it is free above ₹499.",
      },
    ],
  },
  {
    heading: "Shipping & delivery",
    items: [
      {
        question: "How long will my order take to arrive?",
        answer:
          "We pack within one working day. After that, metro cities typically take two to four working days, and other locations four to seven. Remote PIN codes and the North East can take a little longer. You get a tracking link by email the moment your parcel is handed over.",
      },
      {
        question: "How much does shipping cost?",
        answer:
          "Free on orders above ₹499. Below that it is a flat ₹49 anywhere in India, whether you are in the next district or the far side of the country.",
      },
      {
        question: "Do you ship outside India?",
        answer:
          "Not yet. We ship only within India at present. International shipping of food products involves per-country import rules that we would rather get right than improvise, so we will announce it when it is genuinely ready rather than take orders we cannot fulfil.",
      },
    ],
  },
  {
    heading: "The products",
    items: [
      {
        question: "What does GI-tagged actually mean?",
        answer:
          "A Geographical Indication is a legal registration that reserves a product name for producers inside one defined area — so 'Lakadong turmeric' can only lawfully be called that if it came from the Lakadong villages of Meghalaya. It guarantees origin and that the registered traditional method was followed. It is not a quality grade, and it is not an organic certificate. We wrote a full explanation in the journal.",
      },
      {
        question: "Are your spices pure, or blended with anything?",
        answer:
          "Pure. Our turmeric is turmeric and our chilli is chilli — no husk, no bran, no rice starch, no salt, no anti-caking agent and no synthetic colour. Chilli is ground from whole de-stemmed pods with the seeds intact, which is traditional practice and part of why the flavour holds up.",
      },
      {
        question: "Why does the colour vary a little between orders?",
        answer:
          "Because nothing is added to standardise it. Natural colour shifts with the harvest lot, the rainfall that season and how long the crop dried in the sun. Powder that looks exactly the same in every pack, every month, has usually been colour-corrected. A little variation across the year is what unadulterated spice genuinely looks like.",
      },
      {
        question: "How should I store spices and how long do they keep?",
        answer:
          "Airtight, away from light and heat, and not on the shelf above your hob where steam reaches them. Ground spices stay good for around twelve months, but the aroma is at its best in the first three or four — which is why we mill in small batches rather than grinding a year of stock at once.",
      },
      {
        question: "Do these products have health benefits?",
        answer:
          "We are a food company, not a medical one, so we will not make health claims. What we will tell you is exactly where each crop was grown, how it was processed, and what it contains — for example that our Lakadong turmeric runs 7–12% curcumin. If you are considering any food in concentrated or medicinal amounts, particularly during pregnancy or alongside medication, that is a conversation for you and your doctor.",
      },
    ],
  },
  {
    heading: "Returns & problems",
    items: [
      {
        question: "What if my order arrives damaged or wrong?",
        answer:
          "Tell us within 48 hours with a photograph and we will replace it or refund it in full — you will not be asked to ship it back. This is the one situation where we do not want a debate: if a parcel arrived in a state you would not accept, that is our problem, not yours.",
      },
      {
        question: "Can I return a product I simply did not like?",
        answer:
          "Food safety rules mean we cannot resell an opened food product, so we cannot accept returns of opened packs for change of mind. Sealed, unopened packs can be returned within seven days of delivery. If something tasted wrong to you, write to us anyway — that is usually a sourcing signal we want to hear about.",
      },
    ],
  },
];

/** Flattened view for the FAQPage structured data. */
export const FAQ_FLAT = FAQ_GROUPS.flatMap((group) => group.items);
