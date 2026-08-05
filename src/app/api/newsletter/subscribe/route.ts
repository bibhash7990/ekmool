import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { subscribe } from "@/db/queries/newsletter";
import { buildNewsletterConfirmEmail } from "@/emails/newsletter-confirm";
import { sendAndLog } from "@/lib/mail";
import { appUrl } from "@/lib/env";
import { HONEYPOT_FIELD } from "@/lib/honeypot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Newsletter sign-up, as a native form post.
 *
 * It takes `application/x-www-form-urlencoded` and answers with a redirect,
 * which means the footer form needs **no JavaScript at all** — no client
 * component in the root layout, no bytes on any page, and it works before
 * hydration and with scripts blocked. The M11 lesson holds: a control that
 * appears on every page of the site should cost nothing on pages that will
 * never use it.
 *
 * The trade is that Turnstile cannot run here (it needs a script). The
 * honeypot and the rate limiter carry it instead, which is proportionate:
 * the worst a bot achieves is one confirmation email to an address that
 * then does nothing, because a pending row is not a subscriber.
 *
 * Every path answers the same way. Telling one address "you are already
 * subscribed" and another "check your email" makes this an oracle for who
 * reads this newsletter.
 */

const schema = z.object({
  email: z.email().max(200),
});

const DONE = "/newsletter/check-your-inbox";
const BAD = "/newsletter/check-your-inbox?invalid=1";

function redirect(request: NextRequest, path: string): NextResponse {
  // 303: the browser must follow with GET, not repeat the POST.
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(request, BAD);
  }

  // Silently successful-looking, so a bot learns nothing from the reply.
  if (String(form.get(HONEYPOT_FIELD) ?? "").length > 0) {
    return redirect(request, DONE);
  }

  const parsed = schema.safeParse({ email: form.get("email") });
  if (!parsed.success) return redirect(request, BAD);

  try {
    const result = await subscribe(parsed.data.email);

    if (result.outcome === "confirmation_sent") {
      // Awaited: without it a serverless invocation can be torn down at the
      // redirect and the one email that makes this work never leaves.
      await sendAndLog(
        "newsletter_confirm",
        buildNewsletterConfirmEmail(
          parsed.data.email,
          result.token,
          appUrl,
        ),
      );
    }

    return redirect(request, DONE);
  } catch (error) {
    console.error("[newsletter] subscribe failed:", error);
    // The same destination, with a flag the page can read. A database
    // outage should not lose someone's intent behind a stack trace.
    return redirect(request, `${DONE}?unavailable=1`);
  }
}
