import type { AtlasData, AtlasSnapshot } from "../types.ts";
import { transformLive } from "./transform.ts";

const CHAINS_URL = "https://api.llama.fi/v2/chains";
const PROTOCOLS_URL = "https://api.llama.fi/protocols";
const BRIDGES_URL =
  "https://api.llama.fi/overview/bridges?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";

export class LoadError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LoadError";
    this.cause = cause;
  }
}

function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const cancel = () => clearTimeout(timer);
  ctrl.signal.addEventListener("abort", cancel);
  signal?.addEventListener("abort", () => ctrl.abort());
  return ctrl.signal;
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: withTimeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as T;
}

async function fetchLive(): Promise<AtlasSnapshot> {
  const [chains, protocols, bridges] = await Promise.all([
    getJson<unknown[]>(CHAINS_URL, 12_000),
    getJson<unknown[]>(PROTOCOLS_URL, 18_000),
    getJson<{ protocols?: unknown[] }>(BRIDGES_URL, 12_000),
  ]);
  return transformLive(
    chains as Parameters<typeof transformLive>[0],
    protocols as Parameters<typeof transformLive>[1],
    bridges as Parameters<typeof transformLive>[2],
  );
}

async function fetchSnapshot(): Promise<AtlasSnapshot> {
  const res = await fetch("./data/snapshot.json", {
    headers: { accept: "application/json" },
    signal: withTimeout(8_000),
  });
  if (!res.ok) throw new Error(`snapshot.json returned ${res.status}`);
  const data = (await res.json()) as AtlasSnapshot;
  if (!data?.chains?.length) throw new Error("snapshot.json is empty");
  return data;
}

export async function loadAtlas(): Promise<AtlasData> {
  try {
    const live = await fetchLive();
    return { ...live, source: "live" };
  } catch (liveError) {
    try {
      const snap = await fetchSnapshot();
      return { ...snap, source: "snapshot" };
    } catch (snapError) {
      throw new LoadError(
        "Could not load live DefiLlama data or the local snapshot.",
        { liveError, snapError },
      );
    }
  }
}
