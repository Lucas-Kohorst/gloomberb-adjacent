import { describe, expect, test } from "bun:test";
import { buildDetailBody, filingKindLabel, formatFilingDay, stripMarkdownHeader } from "./cftc";
import type { CftcFiling } from "./types";

function filing(overrides: Partial<CftcFiling> = {}): CftcFiling {
  return {
    id: 64839,
    title: "Update to Dogecoin US Dollar Spot contract terms",
    feed: "ptc_dcm_rules",
    orgCode: "BTNL",
    status: "10 Day Review",
    statusDate: "2026-10-02",
    receiptDate: "2026-10-02",
    predictedEffectiveDate: "2026-10-16",
    docCount: 1,
    description: "Update to Dogecoin US Dollar Spot contract terms",
    productName: null,
    productType: null,
    category: null,
    subcategory: null,
    productsAffected: null,
    remarks: null,
    firstSeenAt: "2026-10-02T23:50:00.744582Z",
    lastSeenAt: null,
    ...overrides,
  };
}

describe("CFTC filing text", () => {
  test("labels feeds and keeps a date-only day on that calendar date", () => {
    expect(filingKindLabel("dcm_products")).toBe("New contract");
    expect(filingKindLabel("dco")).toBe("Registration");
    expect(filingKindLabel("ptc_dcm_rules")).toBe("Amendment");
    expect(filingKindLabel("dco_rules")).toBe("Amendment");
    expect(formatFilingDay("2026-10-02")).toBe("10/2/26");
    expect(formatFilingDay(null)).toBe("—");
  });

  test("drops the repeated title and facts from the filing markdown", () => {
    const row = filing();
    const markdown = [
      "# Update to Dogecoin US Dollar Spot contract terms",
      "",
      "- **Org:** BTNL",
      "- **Status:** 10 Day Review (2026-10-02)",
      "",
      "## Description",
      "",
      "Update to Dogecoin US Dollar Spot contract terms",
      "",
      "## Attachments",
      "",
      "The exchange submits this certification.",
    ].join("\n");
    expect(stripMarkdownHeader(markdown, row.title)).toBe("## Attachments\n\nThe exchange submits this certification.");
    expect(buildDetailBody(row, markdown, false)).toContain("The exchange submits this certification.");
    expect(buildDetailBody(row, "", true)).toBe("Loading filing text...");
  });
});
