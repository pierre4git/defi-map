# Chain Atlas

A static visualization of blockchains, the dapps on them, and the bridges that move value between them. Circles are sized by TVL. Lines are corridors inferred from DefiLlama bridge volumes.

Click a chain to zoom into its protocols, grouped by category. Search finds a chain or a dapp. Hover anything for a tooltip.

## Run locally

```bash
npm install
npm run snapshot   # optional offline fallback
npm run dev
```

The Vite dev server listens on [http://127.0.0.1:43147](http://127.0.0.1:43147).

`npm install` resolves dependencies from `package.json`. After the first install you can refresh the committed snapshot with `npm run snapshot` if you want the app to keep working when DefiLlama is unreachable.

## How data is loaded

At runtime the app fetches three public DefiLlama endpoints (all CORS-open):

- `https://api.llama.fi/v2/chains`
- `https://api.llama.fi/protocols`
- `https://api.llama.fi/overview/bridges`

`bridges.llama.fi` currently returns HTTP 402, so bridge volume comes from the overview endpoint instead. If a live fetch fails, the app falls back to `public/data/snapshot.json`.

Refresh the snapshot:

```bash
npm run snapshot
```

CEX and “Chain” protocol rows are dropped so the dive-in view stays about dapps. Wide mesh bridges (LayerZero, CCIP, …) are drawn as a star from the highest-TVL chain they serve, so the graph does not become a complete clique.

## Build / deploy as a static site

```bash
npm install
npm run build
```

Output is in `dist/`. Paths are relative (`base: './'`), so the folder can be hosted on GitHub Pages, Vercel, Netlify, or any static file host.

**GitHub Pages:** set the Pages source to GitHub Actions or upload `dist/`. If the site is served from a project subpath, `base: './'` still works.

**Vercel:** import the repo and use the defaults — build command `npm run build`, output `dist`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server on port 43147 |
| `npm run build` | Typecheck and production bundle |
| `npm run preview` | Serve the production bundle locally |
| `npm run snapshot` | Refresh `public/data/snapshot.json` from DefiLlama |
