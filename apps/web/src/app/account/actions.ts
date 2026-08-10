"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/account";
import {
  updateCustomerProfile,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  TooManyAddressesError,
  MAX_ADDRESSES,
} from "@/db/queries/customers";
import { profileSchema, savedAddressSchema } from "@ekmool/contracts/account";

/**
 * Every action starts with requireAccount(), which resolves the customer
 * from the session cookie and nowhere else. Nothing here takes a customer
 * id from the form — that is the whole reason one customer cannot reach
 * another's data.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Field name → message, for inline display. */
  errors?: Record<string, string>;
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[issue.path.length - 1] ?? "");
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export async function updateProfileAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { email } = await requireAccount();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error.issues),
    };
  }

  try {
    const updated = await updateCustomerProfile(email, parsed.data);
    if (!updated) {
      return { ok: false, message: "We could not find your details. Try signing in again." };
    }
    revalidatePath("/account");
    revalidatePath("/account/profile");
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("[account] profile update failed:", error);
    return { ok: false, message: "We could not save that just now. Please try again." };
  }
}

export async function saveAddressAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { customer } = await requireAccount();
  if (!customer) {
    return { ok: false, message: "We could not load your account just now. Please try again." };
  }

  const rawId = formData.get("addressId");
  const addressId = rawId ? Number(rawId) : null;
  if (rawId && (!Number.isInteger(addressId) || (addressId ?? 0) <= 0)) {
    return { ok: false, message: "That address no longer exists." };
  }

  const parsed = savedAddressSchema.safeParse({
    label: formData.get("label"),
    line1: formData.get("line1"),
    line2: formData.get("line2") ?? "",
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    landmark: formData.get("landmark") ?? "",
    isDefault: formData.get("isDefault") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error.issues),
    };
  }

  try {
    if (addressId) {
      const updated = await updateAddress(customer.id, addressId, parsed.data);
      if (!updated) return { ok: false, message: "That address no longer exists." };
    } else {
      await createAddress(customer.id, parsed.data);
    }
    revalidatePath("/account/addresses");
    return { ok: true, message: addressId ? "Address updated." : "Address saved." };
  } catch (error) {
    if (error instanceof TooManyAddressesError) {
      return {
        ok: false,
        message: `You can keep up to ${MAX_ADDRESSES} addresses. Delete one you no longer use first.`,
      };
    }
    console.error("[account] address save failed:", error);
    return { ok: false, message: "We could not save that just now. Please try again." };
  }
}

export async function deleteAddressAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { customer } = await requireAccount();
  if (!customer) {
    return { ok: false, message: "We could not load your account just now. Please try again." };
  }

  const addressId = Number(formData.get("addressId"));
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return { ok: false, message: "That address no longer exists." };
  }

  try {
    const deleted = await deleteAddress(customer.id, addressId);
    if (!deleted) return { ok: false, message: "That address no longer exists." };
    revalidatePath("/account/addresses");
    return { ok: true, message: "Address deleted." };
  } catch (error) {
    console.error("[account] address delete failed:", error);
    return { ok: false, message: "We could not delete that just now. Please try again." };
  }
}

export async function setDefaultAddressAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { customer } = await requireAccount();
  if (!customer) {
    return { ok: false, message: "We could not load your account just now. Please try again." };
  }

  const addressId = Number(formData.get("addressId"));
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return { ok: false, message: "That address no longer exists." };
  }

  try {
    const changed = await setDefaultAddress(customer.id, addressId);
    if (!changed) return { ok: false, message: "That address no longer exists." };
    revalidatePath("/account/addresses");
    return { ok: true, message: "Default address updated." };
  } catch (error) {
    console.error("[account] default address failed:", error);
    return { ok: false, message: "We could not save that just now. Please try again." };
  }
}
