import type { AtlasSnapshot, SlimChain, SlimEdge, SlimProtocol } from "../types.ts";
import { canonicalChain } from "./meta.ts";

const SKIP_TVL_SUFFIXES = [
  "-borrowed",
  "-staking",
  "-pool2",
  "-vesting",
  "-OwnTokens",
];

function isMetaTvlKey(key: string): boolean {
  if (key.includes("OwnTokens")) return true;
  return SKIP_TVL_SUFFIXES.some((s) => key.endsWith(s));
}

type RawChain = {
  name: string;
  tvl?: number;
  gecko_id?: string | null;
  tokenSymbol?: string | null;
  chainId?: number | string | null;
};

type RawProtocol = {
  id?: string | number;
  name?: string;
  slug?: string;
  logo?: string;
  url?: string | null;
  description?: string;
  category?: string;
  twitter?: string | null;
  tvl?: number;
  chainTvls?: Record<string, number>;
};

type RawBridge = {
  name?: string;
  displayName?: string;
  chains?: string[];
  total30d?: number;
  total24h?: number;
};

function slimChainTvls(
  chainTvls: Record<string, number> | undefined,
  keep: Set<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!chainTvls) return out;
  for (const [key, value] of Object.entries(chainTvls)) {
    if (isMetaTvlKey(key)) continue;
    if (typeof value !== "number" || !(value > 0)) continue;
    const name = canonicalChain(key);
    if (!name || !keep.has(name)) continue;
    out[name] = (out[name] || 0) + value;
  }
  return out;
}

function buildEdges(bridgeProtocols: RawBridge[], chainTvl: Map<string, number>): SlimEdge[] {
  const map = new Map<string, SlimEdge>();

  const add = (a: string, b: string, volume: number, bridgeName: string) => {
    if (!a || !b || a === b || !(volume > 0)) return;
    const [s, t] = a < b ? [a, b] : [b, a];
    const key = `${s}|${t}`;
    let edge = map.get(key);
    if (!edge) {
      edge = { source: s, target: t, volume: 0, bridges: [] };
      map.set(key, edge);
    }
    edge.volume += volume;
    const existing = edge.bridges.find((x) => x.name === bridgeName);
    if (existing) existing.volume += volume;
    else edge.bridges.push({ name: bridgeName, volume });
  };

  for (const proto of bridgeProtocols) {
    const names = [
      ...new Set((proto.chains || []).map(canonicalChain).filter((n): n is string => Boolean(n))),
    ];
    const vol = Number(proto.total30d || proto.total24h || 0);
    if (!(vol > 0) || names.length < 2) continue;
    const label = proto.displayName || proto.name || "Bridge";

    if (names.length === 2) {
      add(names[0], names[1], vol, label);
      continue;
    }

    if (names.length <= 10) {
      const pairs = (names.length * (names.length - 1)) / 2;
      const share = vol / pairs;
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          add(names[i], names[j], share, label);
        }
      }
      continue;
    }

    const hub = names
      .slice()
      .sort((a, b) => (chainTvl.get(b) || 0) - (chainTvl.get(a) || 0))[0];
    const others = names.filter((n) => n !== hub);
    const share = vol / others.length;
    for (const n of others) add(hub, n, share, label);
  }

  return [...map.values()]
    .map((e) => ({
      ...e,
      bridges: e.bridges.sort((a, b) => b.volume - a.volume).slice(0, 6),
    }))
    .sort((a, b) => b.volume - a.volume);
}

export function transformLive(
  chainsRaw: RawChain[],
  protocolsRaw: RawProtocol[],
  bridgesRaw: { protocols?: RawBridge[] },
): AtlasSnapshot {
  const chains: SlimChain[] = chainsRaw
    .map((c) => ({
      name: c.name,
      tvl: Number(c.tvl) || 0,
      geckoId: c.gecko_id ?? null,
      tokenSymbol: c.tokenSymbol ?? null,
      chainId: c.chainId ?? null,
    }))
    .filter((c) => c.name)
    .sort((a, b) => b.tvl - a.tvl);

  const topNames = new Set(chains.slice(0, 120).map((c) => c.name));
  const chainTvl = new Map(chains.map((c) => [c.name, c.tvl]));

  const protocols: SlimProtocol[] = [];
  for (const p of protocolsRaw) {
    if (!p?.name) continue;
    const category = p.category || "Other";
    if (category === "CEX" || category === "Chain") continue;
    const chainTvls = slimChainTvls(p.chainTvls, topNames);
    if (Object.keys(chainTvls).length === 0) continue;
    const tvlOnKept = Object.values(chainTvls).reduce((s, n) => s + n, 0);
    if (tvlOnKept < 50_000) continue;
    protocols.push({
      id: String(p.id ?? p.slug ?? p.name),
      name: p.name,
      slug: p.slug ?? "",
      logo: p.logo ?? "",
      url: p.url ?? null,
      description: p.description ?? "",
      category,
      twitter: p.twitter ?? null,
      tvl: Number(p.tvl) || tvlOnKept,
      chainTvls,
    });
  }

  const edges = buildEdges(bridgesRaw.protocols || [], chainTvl).filter(
    (e) => topNames.has(e.source) && topNames.has(e.target),
  );

  return {
    updatedAt: new Date().toISOString(),
    chains: chains.slice(0, 120),
    protocols,
    edges: edges.slice(0, 400),
  };
}
