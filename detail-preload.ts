import type { AdjacentClient } from "./client";

/** The detail calls a preload may warm. The pane passes its own client, so a warm request hits the same cache. */
export type AdjacentDetailClient = Pick<
  AdjacentClient,
  "isPublic" | "getConstituents" | "getIndexNews" | "getIndexFilings" | "getIndexPrices"
>;

export interface AdjacentIndexSubject {
  kind: "index";
  id: string;
}

/** Runs when an index row is selected, before its detail opens. */
export interface AdjacentDetailPreload {
  id: string;
  prefetch(client: AdjacentDetailClient, subject: AdjacentIndexSubject): Promise<void> | void;
}

const registry: AdjacentDetailPreload[] = [];

export function registerAdjacentDetailPreload(entry: AdjacentDetailPreload): () => void {
  const without = registry.filter((item) => item.id !== entry.id);
  registry.splice(0, registry.length, ...without, entry);
  return () => {
    const at = registry.findIndex((item) => item.id === entry.id && item.prefetch === entry.prefetch);
    if (at >= 0) registry.splice(at, 1);
  };
}

export function prefetchAdjacentIndexDetail(client: AdjacentDetailClient, id: string): void {
  const subject: AdjacentIndexSubject = { kind: "index", id };
  for (const entry of [...registry]) {
    try {
      void Promise.resolve(entry.prefetch(client, subject)).catch(() => undefined);
    } catch {
      // A preload must not break row selection.
    }
  }
}

function installBuiltinPreloads(): void {
  registerAdjacentDetailPreload({
    id: "adjacent-index-constituents",
    prefetch(client, subject) {
      void client.getConstituents(subject.id).catch(() => undefined);
    },
  });
  registerAdjacentDetailPreload({
    id: "adjacent-index-news",
    prefetch(client, subject) {
      void client.getIndexNews(subject.id).catch(() => undefined);
    },
  });
  registerAdjacentDetailPreload({
    id: "adjacent-index-filings",
    prefetch(client, subject) {
      if (client.isPublic) return;
      void client.getIndexFilings(subject.id).catch(() => undefined);
    },
  });
  registerAdjacentDetailPreload({
    id: "adjacent-index-prices",
    prefetch(client, subject) {
      void client.getIndexPrices(subject.id).catch(() => undefined);
    },
  });
}

installBuiltinPreloads();
