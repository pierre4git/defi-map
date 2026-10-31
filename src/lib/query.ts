import type { AtlasData, SlimProtocol } from "../types.ts";
import { categoryGroup } from "./meta.ts";

export type ChainDapp = SlimProtocol & {
  chainTvl: number;
  group: string;
};

export function protocolsOnChain(
  data: AtlasData,
  chain: string,
  limit = 50,
): ChainDapp[] {
  const list: ChainDapp[] = [];
  for (const p of data.protocols) {
    const chainTvl = p.chainTvls[chain] || 0;
    if (chainTvl < 25_000) continue;
    list.push({ ...p, chainTvl, group: categoryGroup(p.category) });
  }
  list.sort((a, b) => b.chainTvl - a.chainTvl);
  return list.slice(0, limit);
}

export function findProtocol(data: AtlasData, id: string): SlimProtocol | undefined {
  return data.protocols.find((p) => p.id === id);
}

export function dappCount(data: AtlasData, chain: string): number {
  let n = 0;
  for (const p of data.protocols) {
    if ((p.chainTvls[chain] || 0) >= 25_000) n += 1;
  }
  return n;
}
