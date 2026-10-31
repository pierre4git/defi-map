import type { AtlasData, SearchHit } from "../types.ts";

export function searchAtlas(data: AtlasData, query: string, chainLimit: number): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const chains = data.chains.slice(0, chainLimit);
  const visible = new Set(chains.map((c) => c.name));
  const hits: SearchHit[] = [];

  for (const c of chains) {
    if (c.name.toLowerCase().includes(q)) {
      hits.push({ kind: "chain", name: c.name, tvl: c.tvl });
    }
  }

  for (const p of data.protocols) {
    if (!p.name.toLowerCase().includes(q)) continue;
    const onVisible = Object.entries(p.chainTvls)
      .filter(([name, tvl]) => visible.has(name) && tvl > 0)
      .sort((a, b) => b[1] - a[1]);
    if (onVisible.length === 0) continue;
    const [chain, tvl] = onVisible[0];
    hits.push({
      kind: "dapp",
      id: p.id,
      name: p.name,
      category: p.category,
      chain,
      tvl,
      logo: p.logo,
    });
  }

  hits.sort((a, b) => {
    const aExact = a.name.toLowerCase() === q ? 1 : 0;
    const bExact = b.name.toLowerCase() === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    if (a.kind !== b.kind) return a.kind === "chain" ? -1 : 1;
    return b.tvl - a.tvl;
  });

  return hits.slice(0, 8);
}
