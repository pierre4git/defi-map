/**
 * Fetch DefiLlama public APIs and write a compact snapshot for
 * offline / CORS fallback. Run: npm run snapshot
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data", "snapshot.json");

const ENDPOINTS = {
  chains: "https://api.llama.fi/v2/chains",
  protocols: "https://api.llama.fi/protocols",
  bridges:
    "https://api.llama.fi/overview/bridges?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
};

/** Map protocol / bridge chain names onto DefiLlama v2/chains names. */
const ALIASES = {
  Binance: "BSC",
  Optimism: "OP Mainnet",
  "zkSync Era": "ZKsync Era",
  "ZKsync Era": "ZKsync Era",
  xDai: "Gnosis",
  Gnosis: "Gnosis",
  RSK: "Rootstock",
  Pulse: "PulseChain",
  Ripple: "XRPL",
  Elrond: "MultiversX",
  Klaytn: "Kaia",
  EOS: "Vaulta",
  Thorchain: "THORChain",
  Op_Bnb: "opBNB",
  WEMIX: "WEMIX3.0",
  Fuel: "Fuel Ignition",
  OKExChain: "OKTChain",
  Terra: "Terra Classic",
  Kucoin: "KCC",
  Bitkub: "KUB",
  "Avalanche C-Chain": "Avalanche",
  Avax: "Avalanche",
  PolygonZkEvm: "Polygon zkEVM",
  "zkSync Lite": "ZKsync Lite",
  "ZKsync Lite": "ZKsync Lite",
  "Oasis Emerald": "Oasis Emerald",
  Kava: "Kava",
  Near: "Near",
  NEAR: "Near",
};

const SKIP_TVL_SUFFIXES = [
  "-borrowed",
  "-staking",
  "-pool2",
  "-vesting",
  "-OwnTokens",
];

function canonical(name) {
  if (!name) return null;
  if (ALIASES[name]) return ALIASES[name];
  return name;
}

function isMetaTvlKey(key) {
  if (key.includes("OwnTokens")) return true;
  return SKIP_TVL_SUFFIXES.some((s) => key.endsWith(s));
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function slimChainTvls(chainTvls, keep) {
  const out = {};
  if (!chainTvls || typeof chainTvls !== "object") return out;
  for (const [key, value] of Object.entries(chainTvls)) {
    if (isMetaTvlKey(key)) continue;
    if (typeof value !== "number" || !(value > 0)) continue;
    const name = canonical(key);
    if (!name || !keep.has(name)) continue;
    out[name] = (out[name] || 0) + value;
  }
  return out;
}

function buildEdges(bridgeProtocols, chainTvl) {
  const map = new Map();

  const add = (a, b, volume, bridgeName) => {
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
      ...new Set(
        (proto.chains || []).map(canonical).filter(Boolean),
      ),
    ];
    const vol = Number(proto.total30d || proto.total24h || 0);
    if (!(vol > 0) || names.length < 2) continue;
    const label = proto.displayName || proto.name;

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

    // Wide meshes (LayerZero, CCIP, …): star from the highest-TVL chain.
    const hub = names
      .slice()
      .sort((a, b) => (chainTvl.get(b) || 0) - (chainTvl.get(a) || 0))[0];
    const others = names.filter((n) => n !== hub);
    const share = vol / others.length;
    for (const n of others) add(hub, n, share, label);
  }

  const edges = [...map.values()]
    .map((e) => ({
      ...e,
      bridges: e.bridges.sort((a, b) => b.volume - a.volume).slice(0, 6),
    }))
    .sort((a, b) => b.volume - a.volume);

  return edges;
}

async function main() {
  console.log("Fetching DefiLlama…");
  const [chainsRaw, protocolsRaw, bridgesRaw] = await Promise.all([
    getJson(ENDPOINTS.chains),
    getJson(ENDPOINTS.protocols),
    getJson(ENDPOINTS.bridges),
  ]);

  const chains = chainsRaw
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

  const protocols = [];
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

  const snapshot = {
    updatedAt: new Date().toISOString(),
    chains: chains.slice(0, 120),
    protocols,
    edges: edges.slice(0, 400),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot));
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));
  console.log(
    `Wrote ${OUT} (${(bytes / 1e6).toFixed(2)} MB) — ${snapshot.chains.length} chains, ${snapshot.protocols.length} protocols, ${snapshot.edges.length} edges`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
