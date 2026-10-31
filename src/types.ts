export type SlimChain = {
  name: string;
  tvl: number;
  geckoId: string | null;
  tokenSymbol: string | null;
  chainId: number | string | null;
};

export type SlimProtocol = {
  id: string;
  name: string;
  slug: string;
  logo: string;
  url: string | null;
  description: string;
  category: string;
  twitter: string | null;
  tvl: number;
  chainTvls: Record<string, number>;
};

export type SlimEdge = {
  source: string;
  target: string;
  volume: number;
  bridges: { name: string; volume: number }[];
};

export type AtlasSnapshot = {
  updatedAt: string;
  chains: SlimChain[];
  protocols: SlimProtocol[];
  edges: SlimEdge[];
};

export type DataSource = "live" | "snapshot";

export type AtlasData = AtlasSnapshot & {
  source: DataSource;
};

export type SearchHit =
  | { kind: "chain"; name: string; tvl: number }
  | {
      kind: "dapp";
      id: string;
      name: string;
      category: string;
      chain: string;
      tvl: number;
      logo: string;
    };
