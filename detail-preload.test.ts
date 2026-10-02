import { describe, expect, test } from "bun:test";
import { prefetchAdjacentIndexDetail, registerAdjacentDetailPreload, type AdjacentDetailClient } from "./detail-preload";

function clientStub(isPublic: boolean): { client: AdjacentDetailClient; calls: string[] } {
  const calls: string[] = [];
  const client: AdjacentDetailClient = {
    isPublic,
    getConstituents: async () => {
      calls.push("constituents");
      return [];
    },
    getIndexNews: async () => {
      calls.push("news");
      return [];
    },
    getIndexFilings: async () => {
      calls.push("filings");
      return [];
    },
    getIndexPrices: async () => {
      calls.push("prices");
      return [];
    },
  };
  return { client, calls };
}

describe("adjacent detail preload", () => {
  test("warms constituents, news, prices, and filings for a keyed index", async () => {
    const { client, calls } = clientStub(false);
    prefetchAdjacentIndexDetail(client, "hou_nti");
    await Promise.resolve();
    expect(calls.sort()).toEqual(["constituents", "filings", "news", "prices"]);
  });

  test("skips filings on the public tier, where that route does not exist", async () => {
    const { client, calls } = clientStub(true);
    prefetchAdjacentIndexDetail(client, "hou_nti");
    await Promise.resolve();
    expect(calls.sort()).toEqual(["constituents", "news", "prices"]);
  });

  test("runs a preload another plugin registered, and stops after dispose", () => {
    const seen: string[] = [];
    const dispose = registerAdjacentDetailPreload({
      id: "test-plugin",
      prefetch(_client, subject) {
        seen.push(subject.id);
      },
    });
    const { client } = clientStub(true);
    prefetchAdjacentIndexDetail(client, "hou_nti");
    expect(seen).toEqual(["hou_nti"]);
    dispose();
    prefetchAdjacentIndexDetail(client, "jac_nti");
    expect(seen).toEqual(["hou_nti"]);
  });
});
