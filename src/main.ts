import "./style.css";
import type { AtlasData, SearchHit, SlimProtocol } from "./types.ts";
import { loadAtlas } from "./lib/data.ts";
import { formatCompactUsd, formatUpdated } from "./lib/format.ts";
import { searchAtlas } from "./lib/search.ts";
import { chainLogo } from "./lib/meta.ts";
import { findProtocol } from "./lib/query.ts";
import { AtlasViz, type AtlasView } from "./viz.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

app.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div>
          <h1>Chain Atlas</h1>
          <p class="tag">Blockchains, dapps, and the bridges between them</p>
        </div>
      </div>
      <div class="search-wrap">
        <svg class="lens" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7"/>
          <path d="M16 16.5 20 20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
        <input id="search" type="search" placeholder="Search a chain or dapp…" autocomplete="off" />
        <ul id="search-results" class="search-results" hidden></ul>
      </div>
      <div class="controls">
        <div class="seg" id="limit-seg" role="tablist" aria-label="How many chains to show">
          <button type="button" data-limit="40" class="active">Top 40</button>
          <button type="button" data-limit="80">Top 80</button>
        </div>
      </div>
    </header>
    <nav class="crumb" id="crumb"></nav>
    <div class="stage-wrap">
      <div id="status"></div>
      <div class="seg dapp-toggle" id="dapp-toggle" hidden>
        <button type="button" data-dapps="default" class="active">Top 50 dapps</button>
        <button type="button" data-dapps="all">More on this chain</button>
      </div>
      <div id="stage"></div>
      <div class="legend" id="legend">
        <div class="legend-item"><span class="dot"></span> Circle size = TVL</div>
        <div class="legend-item"><span class="line"></span> Line thickness = 30-day bridge volume</div>
      </div>
    </div>
    <footer class="footer">
      <span id="source-note">Loading DefiLlama…</span>
      <span>TVL and volumes from <a href="https://defillama.com" target="_blank" rel="noreferrer">DefiLlama</a></span>
    </footer>
    <aside id="card" class="card" hidden></aside>
    <div id="tooltip" class="tooltip" hidden></div>
  </div>
`;

const stage = must("#stage");
const status = must("#status");
const crumb = must("#crumb");
const card = must("#card");
const tooltip = must("#tooltip");
const results = must("#search-results") as HTMLUListElement;
const search = must("#search") as HTMLInputElement;
const sourceNote = must("#source-note");
const dappToggle = must("#dapp-toggle");
const legend = must("#legend");

let data: AtlasData | null = null;
let viz: AtlasViz | null = null;
let chainLimit = 40;
let searchHits: SearchHit[] = [];
let activeHit = 0;
let lastTip: string | null = null;

boot();

async function boot() {
  showBoot();
  try {
    data = await loadAtlas();
    status.innerHTML = "";
    const liveNote =
      data.source === "live"
        ? `Live DefiLlama · ${formatUpdated(data.updatedAt)}`
        : `Snapshot fallback · ${formatUpdated(data.updatedAt)}`;
    sourceNote.textContent = liveNote;
    startViz(data);
  } catch {
    showError();
  }
}

function startViz(atlas: AtlasData) {
  viz?.destroy();
  viz = new AtlasViz(
    stage,
    atlas,
    {
      onHover: (html, x, y) => {
        if (html === null) {
          tooltip.hidden = true;
          lastTip = null;
          return;
        }
        if (html) {
          tooltip.innerHTML = html;
          lastTip = html;
        }
        if (!lastTip) return;
        tooltip.hidden = false;
        const pad = 16;
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        const left = Math.min(window.innerWidth - tw - pad, x + 14);
        const top = Math.min(window.innerHeight - th - pad, y + 16);
        tooltip.style.left = `${Math.max(pad, left)}px`;
        tooltip.style.top = `${Math.max(pad, top)}px`;
      },
      onSelectProtocol: (id, chainName) => openCard(id, chainName),
      onViewChange: (view) => {
        closeCard();
        syncChrome(view);
      },
    },
    chainLimit,
  );
  syncChrome(viz.getView());
}

function showBoot() {
  status.innerHTML = `
    <div class="boot">
      <div class="orbits" aria-hidden="true"><span></span><span></span><span></span></div>
      <p>Mapping the networks…</p>
    </div>`;
}

function showError() {
  status.innerHTML = `
    <div class="error-pane">
      <h2>Could not load atlas data</h2>
      <p>Live DefiLlama requests failed and the local snapshot was unavailable. Check your connection and try again.</p>
      <button type="button" id="retry">Retry</button>
    </div>`;
  must("#retry").addEventListener("click", () => void boot());
}

function syncChrome(view: AtlasView) {
  if (view.type === "home") {
    crumb.innerHTML = `<span>All chains</span>`;
    dappToggle.hidden = true;
    legend.hidden = false;
    return;
  }
  const chain = data?.chains.find((c) => c.name === view.name);
  crumb.innerHTML = `
    <button type="button" id="back-home">All chains</button>
    <span class="sep">/</span>
    <strong>${view.name}</strong>
    <span>${chain ? formatCompactUsd(chain.tvl) + " TVL" : ""}</span>`;
  must("#back-home").addEventListener("click", () => viz?.goHome());
  dappToggle.hidden = false;
  legend.hidden = true;
}

function openCard(id: string, chainName: string) {
  if (!data) return;
  const protocol = findProtocol(data, id);
  if (!protocol) return;
  renderCard(protocol, chainName);
}

function renderCard(p: SlimProtocol, chainName: string) {
  const onChain = p.chainTvls[chainName] || 0;
  const twitter = p.twitter ? `https://twitter.com/${p.twitter.replace(/^@/, "")}` : null;
  card.hidden = false;
  card.innerHTML = `
    <button class="close" type="button" aria-label="Close">×</button>
    <div class="card-head">
      <img src="${p.logo}" alt="" width="48" height="48" />
      <div>
        <h2>${esc(p.name)}</h2>
        <div class="cat">${esc(p.category)} · ${esc(chainName)}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><span>TVL on ${esc(chainName)}</span><b>${formatCompactUsd(onChain)}</b></div>
      <div class="stat"><span>Total TVL</span><b>${formatCompactUsd(p.tvl)}</b></div>
    </div>
    <p class="desc">${p.description ? esc(p.description) : "No description published on DefiLlama."}</p>
    <div class="actions">
      ${p.url ? `<a class="primary" href="${esc(p.url)}" target="_blank" rel="noreferrer">Open project</a>` : ""}
      ${twitter ? `<a class="ghost" href="${twitter}" target="_blank" rel="noreferrer">Twitter</a>` : ""}
      ${p.slug ? `<a class="ghost" href="https://defillama.com/protocol/${esc(p.slug)}" target="_blank" rel="noreferrer">DefiLlama</a>` : ""}
    </div>
  `;
  card.querySelector(".close")?.addEventListener("click", closeCard);
  const img = card.querySelector("img");
  img?.addEventListener("error", () => {
    img.style.display = "none";
  });
}

function closeCard() {
  card.hidden = true;
  card.innerHTML = "";
}

must("#limit-seg").addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest("button[data-limit]");
  if (!btn) return;
  chainLimit = Number(btn.getAttribute("data-limit"));
  for (const b of must("#limit-seg").querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
  viz?.setChainLimit(chainLimit);
  if (viz?.getView().type === "chain") viz.goHome();
});

dappToggle.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest("button[data-dapps]");
  if (!btn) return;
  for (const b of dappToggle.querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
  const mode = btn.getAttribute("data-dapps") === "all" ? "all" : "default";
  viz?.setDappLimit(mode);
});

search.addEventListener("input", () => {
  if (!data) return;
  searchHits = searchAtlas(data, search.value, chainLimit);
  activeHit = 0;
  renderHits();
});

search.addEventListener("keydown", (event) => {
  if (results.hidden) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeHit = Math.min(searchHits.length - 1, activeHit + 1);
    renderHits();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeHit = Math.max(0, activeHit - 1);
    renderHits();
  } else if (event.key === "Enter") {
    event.preventDefault();
    const hit = searchHits[activeHit];
    if (hit) chooseHit(hit);
  } else if (event.key === "Escape") {
    results.hidden = true;
  }
});

document.addEventListener("click", (event) => {
  if (!(event.target as HTMLElement).closest(".search-wrap")) results.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!card.hidden) {
      closeCard();
      return;
    }
    if (viz?.getView().type === "chain") viz.goHome();
  }
});

function renderHits() {
  if (!searchHits.length) {
    results.hidden = true;
    results.innerHTML = "";
    return;
  }
  results.hidden = false;
  results.innerHTML = searchHits
    .map((hit, i) => {
      if (hit.kind === "chain") {
        return `<li>
          <button type="button" data-i="${i}" class="${i === activeHit ? "active" : ""}">
            <img src="${chainLogo(hit.name)}" alt="" />
            <span>${esc(hit.name)}<div class="meta">Blockchain</div></span>
            <span class="tvl">${formatCompactUsd(hit.tvl)}</span>
          </button>
        </li>`;
      }
      return `<li>
        <button type="button" data-i="${i}" class="${i === activeHit ? "active" : ""}">
          ${hit.logo ? `<img src="${hit.logo}" alt="" />` : `<span class="badge">dApp</span>`}
          <span>${esc(hit.name)}<div class="meta">${esc(hit.category)} · ${esc(hit.chain)}</div></span>
          <span class="tvl">${formatCompactUsd(hit.tvl)}</span>
        </button>
      </li>`;
    })
    .join("");
  results.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-i"));
      const hit = searchHits[i];
      if (hit) chooseHit(hit);
    });
  });
}

function chooseHit(hit: SearchHit) {
  results.hidden = true;
  search.blur();
  if (hit.kind === "chain") {
    closeCard();
    viz?.openChain(hit.name);
    return;
  }
  viz?.openChain(hit.chain, hit.id);
  openCard(hit.id, hit.chain);
}

function must(sel: string): HTMLElement {
  const el = app!.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(sel);
  return el;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
