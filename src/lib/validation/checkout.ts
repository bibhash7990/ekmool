import { z } from "zod";

/**
 * Checkout input contract. The client mirrors these rules for inline
 * validation, but the server treats this as the only authority — and
 * recomputes every price from the database regardless of what was sent.
 */

const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export const INDIAN_STATE_OPTIONS: readonly string[] = INDIAN_STATES;

export const checkoutItemSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().min(1).max(10),
});

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Enter your full name").max(160),
    email: z.email("Enter a valid email address").max(200),
    // 10 digits, first digit 6-9 — the Indian mobile format.
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  }),
  address: z.object({
    line1: z.string().trim().min(4, "Enter your address").max(200),
    line2: z.string().trim().max(200).optional().or(z.literal("")),
    city: z.string().trim().min(2, "Enter your city").max(100),
    state: z.enum(INDIAN_STATES, { message: "Select a state" }),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code"),
    landmark: z.string().trim().max(200).optional().or(z.literal("")),
  }),
  paymentMethod: z.enum(["cod", "razorpay"]),
  items: z.array(checkoutItemSchema).min(1, "Your cart is empty").max(20),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutAddress = CheckoutInput["address"];
export type CheckoutCustomer = CheckoutInput["customer"];
