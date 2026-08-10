import { getGrievanceOfficer } from "@/lib/env";

/**
 * The statutory grievance notice.
 *
 * Rule 4(5) of the Consumer Protection (E-Commerce) Rules 2020 requires an
 * appointed officer, their name and contact details displayed, an
 * acknowledgement within 48 hours, and redressal within one month. The DPDP
 * Act 2023 adds a contact point for data grievances, which in a business
 * this size is the same person.
 *
 * The timelines below are the statutory ones, stated as commitments rather
 * than paraphrased, because a customer reading this needs to know what they
 * are entitled to — not a friendly approximation of it.
 *
 * When no officer is configured this says so plainly and names the escalation
 * route anyway. That is a gap, and it is written as one: the alternative is
 * inventing a person's name to satisfy a legal notice, which would be worse
 * than the gap it papers over.
 */
export function GrievanceOfficerNotice({
  className = "",
}: {
  className?: string;
}) {
  const officer = getGrievanceOfficer();

  return (
    <section
      id="grievance"
      aria-labelledby="grievance-heading"
      className={className}
    >
      <h2 id="grievance-heading" className="eyebrow text-ek-green-700">
        Grievance officer
      </h2>

      {officer ? (
        <dl className="mt-5 space-y-4 text-15">
          <div>
            <dt className="text-ek-green-700">Name</dt>
            <dd className="mt-1 text-ek-green-900">{officer.name}</dd>
          </div>
          <div>
            <dt className="text-ek-green-700">Email</dt>
            <dd className="mt-1">
              <a
                href={`mailto:${officer.email}`}
                className="link-draw text-ek-green-900"
              >
                {officer.email}
              </a>
            </dd>
          </div>
          {officer.phone && (
            <div>
              <dt className="text-ek-green-700">Phone</dt>
              <dd className="mt-1">
                <a
                  href={`tel:${officer.phone.replace(/\s/g, "")}`}
                  className="link-draw text-ek-green-900"
                >
                  {officer.phone}
                </a>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-5 text-15 text-ek-green-700">
          No officer has been appointed yet — this business is not yet
          incorporated, and the name, email and phone number will be published
          here the moment one is. Until then, write to{" "}
          <a
            href="mailto:orders@ekmool.com"
            className="link-draw text-ek-green-900"
          >
            orders@ekmool.com
          </a>{" "}
          and the timelines below still apply.
        </p>
      )}

      <div className="mt-6 border-t border-ek-green-200 pt-5 text-15 text-ek-green-700">
        <p>
          <strong className="font-medium text-ek-green-900">
            We acknowledge within 48 hours
          </strong>{" "}
          and resolve within one month of receiving a complaint. Both are the
          periods set by rule 4(5) of the Consumer Protection (E-Commerce)
          Rules 2020, and we treat them as commitments rather than ceilings.
        </p>
        <p className="mt-3">
          Include your order reference if you have one. Complaints about your
          personal data — access, correction or erasure — reach the same
          person, though you can do all three yourself under{" "}
          <a href="/account/privacy" className="link-draw text-ek-green-900">
            Your data
          </a>{" "}
          without writing to anybody.
        </p>
        <p className="mt-3">
          If we do not resolve it, you can escalate to the National Consumer
          Helpline on <span className="whitespace-nowrap">1915</span> or at{" "}
          <a
            href="https://consumerhelpline.gov.in"
            rel="noopener noreferrer"
            target="_blank"
            className="link-draw text-ek-green-900"
          >
            consumerhelpline.gov.in
          </a>
          .
        </p>
      </div>
    </section>
  );
}
