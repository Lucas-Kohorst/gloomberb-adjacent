import { formatTimeAgo } from "gloomberb/utils";
import type { CftcFiling } from "./types";

const FEED_LABELS: Record<string, string> = {
  ptc_dcm_rules: "PTC/DCM Rules",
  dcm_products: "DCM Products",
  dco: "DCO",
  dco_rules: "DCO Rules",
};

const KIND_LABELS: Record<string, string> = {
  dcm_products: "New contract",
  dco: "Registration",
  ptc_dcm_rules: "Amendment",
  dco_rules: "Amendment",
};

export function feedLabel(feed: string): string {
  return FEED_LABELS[feed] ?? feed;
}

export function filingKindLabel(feed: string): string {
  return KIND_LABELS[feed] ?? (feed ? feedLabel(feed) : "Filing");
}

/** CFTC publishes a calendar date. Keep that day in UTC so a date-only string does not slip backward. */
export function formatFilingDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function filingSeenAt(filing: CftcFiling): string | null {
  return filing.firstSeenAt ?? filing.lastSeenAt;
}

export function filingSeenLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatTimeAgo(date);
}

export function filingSortTime(iso: string | null): number {
  if (!iso) return 0;
  const time = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(time) ? 0 : time;
}

function classification(filing: CftcFiling): string | null {
  const parts = [filing.productType, filing.category, filing.subcategory].filter((part): part is string => !!part);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(" · ") : null;
}

export function buildDetailMeta(filing: CftcFiling): string[] {
  const meta = [filingKindLabel(filing.feed)];
  if (filing.status) meta.push(filing.status);
  const day = formatFilingDay(filing.statusDate);
  if (day !== "—") meta.push(day);
  const feed = feedLabel(filing.feed);
  if (feed) meta.push(feed);
  const receipt = formatFilingDay(filing.receiptDate);
  if (receipt !== "—") meta.push(`received ${receipt}`);
  const predicted = formatFilingDay(filing.predictedEffectiveDate);
  if (predicted !== "—") meta.push(`est. effective ${predicted}`);
  if (filing.docCount > 0) meta.push(`${filing.docCount} doc${filing.docCount === 1 ? "" : "s"}`);
  return meta;
}

/**
 * The markdown opens with an H1 and a facts list that repeat the title and meta,
 * so the detail body starts after them.
 */
export function stripMarkdownHeader(markdown: string, title: string): string {
  const lines = markdown.split("\n");
  let index = 0;
  const skipBlank = () => {
    while (index < lines.length && lines[index]!.trim() === "") index += 1;
  };

  skipBlank();
  if (index < lines.length && lines[index]!.startsWith("# ")) index += 1;
  skipBlank();
  while (index < lines.length && lines[index]!.trimStart().startsWith("- **")) index += 1;
  skipBlank();

  if (index < lines.length && /^##\s+description$/i.test(lines[index]!.trim())) {
    let lookahead = index + 1;
    while (lookahead < lines.length && lines[lookahead]!.trim() === "") lookahead += 1;
    if (lookahead < lines.length && lines[lookahead]!.trim() === title.trim()) {
      index = lookahead + 1;
      skipBlank();
    }
  }

  return lines.slice(index).join("\n").trim();
}

export function buildDetailBody(filing: CftcFiling, markdown: string, loading: boolean): string {
  if (loading) return "Loading filing text...";
  const body = stripMarkdownHeader(markdown, filing.title);
  if (body) return body;
  const sections = [
    classification(filing),
    filing.description && filing.description !== filing.title ? filing.description : null,
    filing.productsAffected ? `Products affected: ${filing.productsAffected}` : null,
    filing.remarks ? `Remarks: ${filing.remarks}` : null,
  ].filter((section): section is string => !!section);
  return sections.length > 0 ? sections.join("\n\n") : "No further detail was published for this filing.";
}
