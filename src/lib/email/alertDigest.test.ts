import { describe, expect, it } from "vitest";
import {
  buildAlertDigestHtml,
  buildAlertDigestSubject,
  getDigestWindowStart,
  groupDigestAlertsByStore,
  type DigestAlert,
} from "@/lib/email/alertDigest";

const BASE_ALERT: DigestAlert = {
  id: "alert-1",
  store_id: "store-a",
  severity: "danger",
  title: "Revenue Down",
  body: "TTM revenue fell 12% vs prior period.",
  created_at: "2026-08-01T12:00:00.000Z",
};

describe("alert digest helpers", () => {
  it("uses a 24-hour fallback window when no prior digest was sent", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const since = getDigestWindowStart(null, now);

    expect(since.toISOString()).toBe("2026-07-31T12:00:00.000Z");
  });

  it("uses the stored digest timestamp when available", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const since = getDigestWindowStart("2026-07-28T09:15:00.000Z", now);

    expect(since.toISOString()).toBe("2026-07-28T09:15:00.000Z");
  });

  it("groups alerts by store and sorts by severity", () => {
    const groups = groupDigestAlertsByStore(
      [
        BASE_ALERT,
        {
          ...BASE_ALERT,
          id: "alert-2",
          severity: "info",
          title: "Valuation Updated",
          body: "Business value changed.",
        },
        {
          ...BASE_ALERT,
          id: "alert-3",
          store_id: "store-b",
          severity: "warning",
          title: "Lease Expiring",
          body: "Lease ends in 90 days.",
        },
      ],
      {
        "store-a": "Downtown",
        "store-b": "Airport",
      }
    );

    expect(groups.map((group) => group.storeName)).toEqual(["Airport", "Downtown"]);
    expect(groups[1]?.alerts.map((alert) => alert.severity)).toEqual(["danger", "info"]);
  });

  it("builds a pluralized subject line", () => {
    expect(buildAlertDigestSubject(1)).toBe("LaundroCFO: 1 new alert for your stores");
    expect(buildAlertDigestSubject(4)).toBe("LaundroCFO: 4 new alerts for your stores");
  });

  it("escapes alert content in the HTML template", () => {
    const html = buildAlertDigestHtml({
      recipientName: "Taylor <script>",
      groups: [
        {
          storeId: "store-a",
          storeName: "Main & <script>",
          alerts: [
            {
              ...BASE_ALERT,
              title: "Title <script>alert(1)</script>",
              body: "Body with <b>html</b> & quotes",
            },
          ],
        },
      ],
      alertsUrl: "https://www.laundrocfo.com/alerts",
      accountUrl: "https://www.laundrocfo.com/account",
    });

    expect(html).toContain("Hi Taylor &lt;script&gt;");
    expect(html).toContain("Main &amp; &lt;script&gt;");
    expect(html).toContain("Title &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Body with &lt;b&gt;html&lt;/b&gt; &amp; quotes");
    expect(html).toContain("View All Alerts →");
  });
});
