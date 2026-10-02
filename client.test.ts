import { afterEach, describe, expect, test } from "bun:test";
import { AdjacentClient } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(body: unknown, status = 200): { urls: string[]; authorizations: Array<string | null> } {
  const urls: string[] = [];
  const authorizations: Array<string | null> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    const headers = new Headers(init?.headers);
    authorizations.push(headers.get("Authorization"));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { urls, authorizations };
}

describe("AdjacentClient detail routes", () => {
  test("loads related index news from the public route", async () => {
    const seen = mockFetch({
      data: [{
        article_id: "hou-1",
        title: "Texans injury report",
        url: "https://example.com/texans",
        source: "USA Today",
        published_date: "2026-09-25T17:42:11Z",
        via_market_question: "Will Houston win at least 3 games?",
      }],
    });
    const client = new AdjacentClient(null);
    const articles = await client.getIndexNews("hou_nti");
    expect(seen.urls).toEqual([
      "https://api.adjacent.markets/api/v1/public/indices/hou_nti/news?per_page=3",
    ]);
    expect(articles[0]).toMatchObject({
      id: "hou-1",
      title: "Texans injury report",
      summary: "Will Houston win at least 3 games?",
    });
    await client.getIndexNews("hou_nti");
    expect(seen.urls).toHaveLength(1);
  });

  test("asks the keyed news route for 40 articles", async () => {
    const seen = mockFetch({ data: [] });
    await new AdjacentClient("ak_test").getIndexNews("hou_nti");
    expect(seen.urls).toEqual([
      "https://api.adjacent.markets/api/v1/indices/hou_nti/news?per_page=40",
    ]);
    expect(seen.authorizations).toEqual(["Bearer ak_test"]);
  });

  test("loads related filings on the keyed route and accepts filing_id", async () => {
    const seen = mockFetch({
      data: [{
        filing_id: 63380,
        title: "NFL Starter Designation Contracts",
        org_code: "QCEX",
        status: "Certified",
        status_date: "2026-08-25",
      }],
    });
    const page = await new AdjacentClient("ak_test").getIndexFilings("hou_nti");
    expect(seen.urls).toEqual([
      "https://api.adjacent.markets/api/v1/indices/hou_nti/filings?per_page=40",
    ]);
    expect(seen.authorizations).toEqual(["Bearer ak_test"]);
    expect(page[0]?.id).toBe(63380);
    expect(page[0]?.orgCode).toBe("QCEX");
  });

  test("does not request filings without an API key", async () => {
    const seen = mockFetch({ data: [] });
    await expect(new AdjacentClient(null).getIndexFilings("hou_nti")).rejects.toThrow(/API key/);
    expect(seen.urls).toEqual([]);
  });

  test("refetches a detail slice after invalidate", async () => {
    const seen = mockFetch({ data: [] });
    const client = new AdjacentClient("ak_test");
    await client.getIndexFilings("jac_nti");
    await client.getIndexFilings("jac_nti");
    expect(seen.urls).toHaveLength(1);
    client.invalidate("jac_nti");
    await client.getIndexFilings("jac_nti");
    expect(seen.urls).toHaveLength(2);
  });
});
