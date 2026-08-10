import { z } from "zod";
import { addressSchema, nameSchema, phoneSchema } from "./checkout";

/**
 * Account-area input contracts. Shares its address rules with checkout so
 * a saved address is, by construction, one that checkout would accept.
 */

export const profileSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  // Checkboxes arrive as "on" or not at all, so anything truthy is a yes.
  marketingOptIn: z.coerce.boolean(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const savedAddressSchema = addressSchema.extend({
  label: z.string().trim().min(1, "Give this address a name").max(40),
  isDefault: z.coerce.boolean().optional(),
});

export type SavedAddressInput = z.infer<typeof savedAddressSchema>;

/** Common address labels, offered as suggestions rather than a fixed list. */
export const ADDRESS_LABEL_SUGGESTIONS = ["Home", "Work", "Parents"] as const;
