export const CHAIN_ALIASES: Record<string, string> = {
  Binance: "BSC",
  Optimism: "OP Mainnet",
  "zkSync Era": "ZKsync Era",
  "ZKsync Era": "ZKsync Era",
  xDai: "Gnosis",
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
  Near: "Near",
  NEAR: "Near",
};

export function canonicalChain(name: string | null | undefined): string | null {
  if (!name) return null;
  return CHAIN_ALIASES[name] ?? name;
}

export function chainLogo(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `https://icons.llamao.fi/icons/chains/rsz_${slug}?w=96&h=96`;
}

const NAMED_COLORS: Record<string, string> = {
  Ethereum: "#627eea",
  Bitcoin: "#f7931a",
  Solana: "#14f195",
  Base: "#0052ff",
  BSC: "#f0b90b",
  Tron: "#ff0013",
  Arbitrum: "#28a0f0",
  Avalanche: "#e84142",
  Polygon: "#8247e5",
  Sui: "#4da2ff",
  "OP Mainnet": "#ff0420",
  "Hyperliquid L1": "#50e3c2",
  "Robinhood Chain": "#00c805",
  Monad: "#836ef9",
  Plasma: "#7c5cff",
  Arc: "#5b8def",
  Aptos: "#2dd4bf",
  Near: "#00c08b",
  Cardano: "#0033ad",
  TON: "#0098ea",
  Starknet: "#ec796b",
  Linea: "#61dfff",
  Scroll: "#ffe6a5",
  Mantle: "#65b3ae",
  Blast: "#fcfc03",
  Fantom: "#1969ff",
  Gnosis: "#04795b",
  Celo: "#fcff52",
  Sei: "#9b1c2e",
  Injective: "#00f2fe",
  "zkSync Era": "#8b8df8",
  "ZKsync Era": "#8b8df8",
};

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function chainColor(name: string): string {
  return NAMED_COLORS[name] ?? `hsl(${hashHue(name)} 70% 62%)`;
}

export const CATEGORY_GROUP: Record<string, string> = {
  Dexs: "DEX",
  "DEX Aggregator": "DEX",
  "Dex Aggregators": "DEX",
  Lending: "Lending",
  CDP: "Lending",
  "CDP Manager": "Lending",
  "Collateral Markets": "Lending",
  "NFT Marketplace": "NFT",
  "NFT Lending": "NFT",
  NFTs: "NFT",
  Bridge: "Bridges",
  "Canonical Bridge": "Bridges",
  "Cross Chain Bridge": "Bridges",
  "Bridge Aggregator": "Bridges",
  "Bridge Aggregators": "Bridges",
  "Liquid Staking": "Liquid Staking",
  "Liquid Restaking": "Restaking",
  Restaking: "Restaking",
  Derivatives: "Derivatives",
  Options: "Derivatives",
  Synthetics: "Derivatives",
  "Basis Trading": "Stablecoins",
  "Algo-Stables": "Stablecoins",
  "Stablecoin Issuer": "Stablecoins",
  "Dual-Token Stablecoin": "Stablecoins",
  "Stablecoin Wrapper": "Stablecoins",
  Yield: "Yield",
  "Yield Aggregator": "Yield",
  Farm: "Yield",
  RWA: "RWA",
  "RWA Lending": "RWA",
  "Staking Pool": "Staking",
  "Liquidity Manager": "Liquidity",
  "Onchain Capital Allocator": "Allocators",
  "Risk Curators": "Allocators",
  Gaming: "Gaming",
  "Prediction Market": "Prediction",
  Payments: "Payments",
  Privacy: "Privacy",
  Insurance: "Insurance",
  Launchpad: "Launchpad",
};

export function categoryGroup(raw: string): string {
  return CATEGORY_GROUP[raw] ?? raw;
}

export const CATEGORY_COLORS: Record<string, string> = {
  DEX: "#5eead4",
  Lending: "#93c5fd",
  NFT: "#f0abfc",
  Bridges: "#fbbf24",
  "Liquid Staking": "#86efac",
  Restaking: "#67e8f9",
  Derivatives: "#fda4af",
  Yield: "#c4b5fd",
  RWA: "#fdba74",
  Staking: "#6ee7b7",
  Stablecoins: "#fde047",
  Liquidity: "#7dd3fc",
  Allocators: "#a5b4fc",
  Gaming: "#f9a8d4",
  Prediction: "#fca5a5",
  Payments: "#99f6e4",
  Privacy: "#d4d4d8",
  Insurance: "#bef264",
  Launchpad: "#fdba74",
};

export function categoryColor(group: string): string {
  return CATEGORY_COLORS[group] ?? `hsl(${hashHue(group)} 55% 68%)`;
}
