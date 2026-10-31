import * as d3 from "d3";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3";
import type { AtlasData, SlimEdge } from "./types.ts";
import { chainColor, chainLogo, categoryColor } from "./lib/meta.ts";
import { formatCompactUsd, initials } from "./lib/format.ts";
import { dappCount, protocolsOnChain, type ChainDapp } from "./lib/query.ts";

export type AtlasView = { type: "home" } | { type: "chain"; name: string };

export type VizHandlers = {
  onHover: (html: string | null, x: number, y: number) => void;
  onSelectProtocol: (protocolId: string, chainName: string) => void;
  onViewChange: (view: AtlasView) => void;
};

type ChainNode = SimulationNodeDatum & {
  id: string;
  name: string;
  tvl: number;
  r: number;
  color: string;
  logo: string;
  dappCount: number;
};

type BridgeLink = SimulationLinkDatum<ChainNode> & {
  volume: number;
  bridges: SlimEdge["bridges"];
};

const DAPP_CAP_DEFAULT = 50;
const DAPP_CAP_ALL = 120;

export class AtlasViz {
  private readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly universe: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly system: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly linkLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly interior: d3.Selection<SVGGElement, unknown, null, undefined>;
  private simulation: d3.Simulation<ChainNode, BridgeLink> | null = null;
  private nodes: ChainNode[] = [];
  private links: BridgeLink[] = [];
  private w = 800;
  private h = 600;
  private view: AtlasView = { type: "home" };
  private chainLimit: number;
  private dappLimit = DAPP_CAP_DEFAULT;
  private highlightId: string | null = null;
  private ro: ResizeObserver;
  private readonly host: HTMLElement;
  private readonly data: AtlasData;
  private readonly handlers: VizHandlers;

  constructor(
    host: HTMLElement,
    data: AtlasData,
    handlers: VizHandlers,
    chainLimit = 40,
  ) {
    this.host = host;
    this.data = data;
    this.handlers = handlers;
    this.chainLimit = chainLimit;
    this.svg = d3
      .select(host)
      .append("svg")
      .attr("class", "atlas-svg")
      .attr("role", "img")
      .attr("aria-label", "Blockchain atlas");

    const defs = this.svg.append("defs");
    const glow = defs.append("filter").attr("id", "node-glow").attr("x", "-40%").attr("y", "-40%").attr("width", "180%").attr("height", "180%");
    glow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    glow.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", (d) => d);

    this.universe = this.svg.append("g").attr("class", "universe");
    this.linkLayer = this.universe.append("g").attr("class", "links");
    this.nodeLayer = this.universe.append("g").attr("class", "nodes");

    this.system = this.svg.append("g").attr("class", "system").style("display", "none");
    this.system
      .append("circle")
      .attr("class", "shell")
      .attr("fill", "rgba(10, 12, 20, 0.72)")
      .attr("stroke-width", 2.5);
    this.interior = this.system.append("g").attr("class", "interior");

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.drawHome(true);
  }

  setChainLimit(n: number) {
    if (n === this.chainLimit) return;
    this.chainLimit = n;
    if (this.view.type === "home") this.drawHome(true);
  }

  setDappLimit(n: "default" | "all") {
    this.dappLimit = n === "all" ? DAPP_CAP_ALL : DAPP_CAP_DEFAULT;
    if (this.view.type === "chain") this.renderInterior(this.view.name, this.highlightId);
  }

  getView(): AtlasView {
    return this.view;
  }

  goHome() {
    if (this.view.type === "home") return;
    const name = this.view.name;
    const node = this.nodes.find((n) => n.id === name);
    this.view = { type: "home" };
    this.highlightId = null;
    this.handlers.onViewChange(this.view);

    this.interior.transition().duration(220).style("opacity", 0);
    this.system
      .transition()
      .duration(700)
      .ease(d3.easeCubicInOut)
      .attr("transform", `translate(${node?.x ?? this.w / 2},${node?.y ?? this.h / 2})`)
      .on("end", () => {
        this.system.style("display", "none");
        this.interior.selectAll("*").remove();
      });
    this.system
      .select("circle.shell")
      .transition()
      .duration(700)
      .ease(d3.easeCubicInOut)
      .attr("r", node?.r ?? 20);

    this.universe
      .style("display", null)
      .transition()
      .delay(280)
      .duration(480)
      .style("opacity", 1)
      .on("end", () => this.restartDrift());
  }

  openChain(name: string, protocolId?: string) {
    const node = this.nodes.find((n) => n.id === name);
    if (!node) return;

    const already = this.view.type === "chain" && this.view.name === name;
    this.view = { type: "chain", name };
    this.highlightId = protocolId ?? null;
    this.handlers.onViewChange(this.view);
    this.simulation?.stop();

    if (already) {
      this.renderInterior(name, protocolId);
      return;
    }

    this.system
      .style("display", null)
      .style("opacity", 1)
      .attr("transform", `translate(${node.x ?? this.w / 2},${node.y ?? this.h / 2})`);
    this.system
      .select("circle.shell")
      .attr("r", node.r)
      .attr("stroke", node.color)
      .attr("fill", "rgba(8, 10, 18, 0.78)");
    this.interior.style("opacity", 0).selectAll("*").remove();

    this.universe.transition().duration(420).style("opacity", 0).on("end", function () {
      d3.select(this).style("display", "none");
    });

    this.system
      .transition()
      .duration(820)
      .ease(d3.easeCubicInOut)
      .attr("transform", `translate(${this.w / 2},${this.h / 2})`);
    this.system
      .select("circle.shell")
      .transition()
      .duration(820)
      .ease(d3.easeCubicInOut)
      .attr("r", this.shellR());

    window.setTimeout(() => this.renderInterior(name, protocolId), 480);
  }

  destroy() {
    this.ro.disconnect();
    this.simulation?.stop();
    this.svg.remove();
  }

  private shellR(): number {
    return Math.max(140, Math.min(this.w, this.h) * 0.4);
  }

  private resize() {
    const nextW = Math.max(320, this.host.clientWidth);
    const nextH = Math.max(320, this.host.clientHeight);
    if (nextW === this.w && nextH === this.h && this.nodes.length) return;
    this.w = nextW;
    this.h = nextH;
    this.svg.attr("viewBox", `0 0 ${this.w} ${this.h}`).attr("width", this.w).attr("height", this.h);
    if (this.view.type === "home" && this.nodes.length) {
      this.simulation?.force("x", d3.forceX(this.w / 2).strength(0.04));
      this.simulation?.force("y", d3.forceY(this.h / 2).strength(0.04));
      this.simulation?.force("center", d3.forceCenter(this.w / 2, this.h / 2));
      this.simulation?.alpha(0.2).restart();
    } else if (this.view.type === "chain") {
      this.system.attr("transform", `translate(${this.w / 2},${this.h / 2})`);
      this.system.select("circle.shell").attr("r", this.shellR());
      this.renderInterior(this.view.name, this.highlightId);
    }
  }

  private visibleChains() {
    return this.data.chains.filter((c) => c.tvl > 0).slice(0, this.chainLimit);
  }

  private drawHome(rebuild: boolean) {
    this.simulation?.stop();
    const chains = this.visibleChains();
    const names = new Set(chains.map((c) => c.name));
    const maxR = Math.max(20, Math.min(this.w, this.h) * (this.chainLimit > 50 ? 0.052 : 0.078));
    const minR = this.chainLimit > 50 ? 9 : 13;
    const r = d3
      .scaleSqrt()
      .domain([1, d3.max(chains, (c) => c.tvl) || 1])
      .range([minR, maxR]);

    const prev = new Map(this.nodes.map((n) => [n.id, n]));
    this.nodes = chains.map((c) => {
      const old = prev.get(c.name);
      return {
        id: c.name,
        name: c.name,
        tvl: c.tvl,
        r: r(Math.max(c.tvl, 1)),
        color: chainColor(c.name),
        logo: chainLogo(c.name),
        dappCount: dappCount(this.data, c.name),
        x: old?.x ?? this.w / 2 + (Math.random() - 0.5) * 80,
        y: old?.y ?? this.h / 2 + (Math.random() - 0.5) * 80,
      };
    });

    const nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    const visibleEdges = this.data.edges
      .filter((e) => names.has(e.source) && names.has(e.target))
      .slice(0, this.chainLimit > 50 ? 90 : 70);

    this.links = visibleEdges.map((e) => ({
      source: nodeById.get(e.source)!,
      target: nodeById.get(e.target)!,
      volume: e.volume,
      bridges: e.bridges,
    }));

    const maxVol = d3.max(this.links, (l) => l.volume) || 1;
    const stroke = d3.scaleSqrt().domain([0, maxVol]).range([0.7, 7]);

    const linkSel = this.linkLayer
      .selectAll<SVGLineElement, BridgeLink>("line")
      .data(this.links, (d) => {
        const s = typeof d.source === "object" ? d.source.id : d.source;
        const t = typeof d.target === "object" ? d.target.id : d.target;
        return `${s}|${t}`;
      });
    linkSel.exit().remove();
    const linkEnter = linkSel
      .enter()
      .append("line")
      .attr("class", "bridge")
      .attr("stroke", "rgba(158, 196, 255, 0.42)")
      .attr("stroke-linecap", "round");
    const links = linkEnter.merge(linkSel);
    links.attr("stroke-width", (d) => stroke(d.volume));

    links
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget as SVGLineElement).attr("stroke", "rgba(210, 230, 255, 0.9)");
        const s = (d.source as ChainNode).name;
        const t = (d.target as ChainNode).name;
        const top = d.bridges
          .slice(0, 3)
          .map((b) => `<div class="tip-row"><span>${esc(b.name)}</span><b>${formatCompactUsd(b.volume)}</b></div>`)
          .join("");
        this.handlers.onHover(
          `<div class="tip-kicker">Bridge corridor · 30d volume</div>
           <div class="tip-title">${esc(s)} ↔ ${esc(t)}</div>
           <div class="tip-metric">${formatCompactUsd(d.volume)}</div>
           ${top}`,
          event.clientX,
          event.clientY,
        );
      })
      .on("pointermove", (event) => this.handlers.onHover("", event.clientX, event.clientY))
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget as SVGLineElement).attr("stroke", "rgba(158, 196, 255, 0.42)");
        this.handlers.onHover(null, 0, 0);
      });

    const nodeSel = this.nodeLayer
      .selectAll<SVGGElement, ChainNode>("g.chain")
      .data(this.nodes, (d) => d.id);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", "chain")
      .attr("data-name", (d) => d.id)
      .attr("tabindex", 0)
      .style("cursor", "pointer");

    nodeEnter.append("circle").attr("class", "halo");
    nodeEnter.append("circle").attr("class", "body");
    nodeEnter
      .append("image")
      .attr("class", "logo")
      .attr("preserveAspectRatio", "xMidYMid slice");
    nodeEnter.append("text").attr("class", "letter");
    nodeEnter
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em");

    const nodes = nodeEnter.merge(nodeSel);
    nodes
      .select("circle.halo")
      .attr("r", (d) => d.r + 5)
      .attr("fill", (d) => d.color)
      .attr("opacity", 0.16)
      .attr("filter", "url(#node-glow)");
    nodes
      .select("circle.body")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", 0.22)
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 1.6);
    nodes
      .select("image.logo")
      .attr("href", (d) => d.logo)
      .attr("x", (d) => -d.r * 0.62)
      .attr("y", (d) => -d.r * 0.62)
      .attr("width", (d) => d.r * 1.24)
      .attr("height", (d) => d.r * 1.24)
      .attr("clip-path", (d) => `circle(${d.r * 0.62}px at ${d.r * 0.62}px ${d.r * 0.62}px)`)
      .on("error", function () {
        d3.select(this).attr("href", "");
      });
    nodes
      .select("text.letter")
      .text((d) => initials(d.name))
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#eef2ff")
      .attr("font-size", (d) => Math.max(8, d.r * 0.42))
      .attr("pointer-events", "none")
      .style("display", "none");
    nodes.select("image.logo").each(function () {
      const el = this as SVGImageElement;
      el.addEventListener(
        "error",
        () => {
          d3.select(el.parentNode as SVGGElement)
            .select("text.letter")
            .style("display", null);
        },
        { once: true },
      );
    });

    const labeled = new Set(this.nodes.slice(0, this.chainLimit > 50 ? 12 : 16).map((n) => n.id));
    nodes
      .select("text.label")
      .text((d) => d.name)
      .attr("y", (d) => d.r + 14)
      .attr("fill", "rgba(236, 240, 255, 0.92)")
      .attr("font-size", this.chainLimit > 50 ? 10 : 12)
      .attr("stroke", "rgba(7, 8, 13, 0.88)")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .style("display", (d) => (labeled.has(d.id) ? null : "none"));

    nodes
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget as SVGGElement).select("circle.halo").attr("opacity", 0.32);
        this.handlers.onHover(
          `<div class="tip-kicker">Blockchain</div>
           <div class="tip-title">${esc(d.name)}</div>
           <div class="tip-metric">${formatCompactUsd(d.tvl)} TVL</div>
           <div class="tip-sub">${d.dappCount} protocols · click to dive in</div>`,
          event.clientX,
          event.clientY,
        );
      })
      .on("pointermove", (event) => this.handlers.onHover("", event.clientX, event.clientY))
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget as SVGGElement).select("circle.halo").attr("opacity", 0.16);
        this.handlers.onHover(null, 0, 0);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        this.handlers.onHover(null, 0, 0);
        this.openChain(d.id);
      })
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.openChain(d.id);
        }
      });

    this.simulation = d3
      .forceSimulation(this.nodes)
      .force(
        "link",
        d3
          .forceLink<ChainNode, BridgeLink>(this.links)
          .id((d) => d.id)
          .distance((d) => 88 + 140 / Math.log10((d.volume || 1) + 10))
          .strength(0.28),
      )
      .force(
        "charge",
        d3.forceManyBody<ChainNode>().strength((d) => -36 - d.r * 5),
      )
      .force("center", d3.forceCenter(this.w / 2, this.h / 2))
      .force(
        "collide",
        d3.forceCollide<ChainNode>().radius((d) => d.r + (labeled.has(d.id) ? 18 : 10)).iterations(3),
      )
      .force("x", d3.forceX(this.w / 2).strength(0.12))
      .force("y", d3.forceY(this.h / 2).strength(0.12));

    const tick = () => {
      links
        .attr("x1", (d) => (d.source as ChainNode).x ?? 0)
        .attr("y1", (d) => (d.source as ChainNode).y ?? 0)
        .attr("x2", (d) => (d.target as ChainNode).x ?? 0)
        .attr("y2", (d) => (d.target as ChainNode).y ?? 0);
      nodes.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    const clamp = () => {
      const maxDist = Math.min(this.w, this.h) * 0.4;
      const cx = this.w / 2;
      const cy = this.h / 2;
      for (const n of this.nodes) {
        const dx = (n.x ?? cx) - cx;
        const dy = (n.y ?? cy) - cy;
        const dist = Math.hypot(dx, dy);
        const limit = maxDist - n.r;
        if (dist > limit && dist > 0) {
          n.x = cx + (dx / dist) * limit;
          n.y = cy + (dy / dist) * limit;
        }
      }
    };

    this.simulation.stop();
    for (let i = 0; i < (rebuild ? 240 : 40); i++) this.simulation.tick();
    clamp();
    tick();
    this.simulation.on("tick", () => {
      clamp();
      tick();
    });
    this.restartDrift();

    if (rebuild) {
      nodes
        .attr("opacity", 0)
        .transition()
        .delay((_d, i) => Math.min(i * 8, 240))
        .duration(500)
        .attr("opacity", 1);
      links
        .attr("opacity", 0)
        .transition()
        .delay(180)
        .duration(600)
        .attr("opacity", 1);
    }
  }

  private restartDrift() {
    this.simulation?.alphaTarget(0.018).restart();
  }

  private renderInterior(chainName: string, pulseId?: string | null) {
    const R = this.shellR();
    const dapps = protocolsOnChain(this.data, chainName, this.dappLimit);
    this.interior.selectAll("*").remove();

    if (dapps.length === 0) {
      this.interior
        .append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(230,234,246,0.72)")
        .attr("font-size", 14)
        .text("No protocol TVL recorded on this chain.");
      this.interior.transition().duration(280).style("opacity", 1);
      return;
    }

    const groups = d3.group(dapps, (d) => d.group);
    const hierarchy: PackDatum = {
      name: chainName,
      children: [...groups.entries()]
        .map(([name, items]) => ({
          name,
          children: items.map((d) => ({ name: d.name, value: d.chainTvl, dapp: d })),
        }))
        .sort(
          (a, b) =>
            d3.sum(b.children ?? [], (c) => c.value || 0) - d3.sum(a.children ?? [], (c) => c.value || 0),
        ),
    };

    const root = d3.pack<PackDatum>()
      .size([R * 2 - 18, R * 2 - 18])
      .padding((n) => (n.depth === 0 ? 16 : 5))(
        d3
          .hierarchy<PackDatum>(hierarchy)
          .sum((d) => d.value || 0)
          .sort((a, b) => (b.value || 0) - (a.value || 0)),
      );

    const g = this.interior.attr("transform", `translate(${-R + 9},${-R + 9})`);

    const cats = root.children ?? [];
    const catG = g
      .selectAll("g.cat")
      .data(cats)
      .join("g")
      .attr("class", "cat")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    catG
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => categoryColor(d.data.name))
      .attr("fill-opacity", 0.07)
      .attr("stroke", (d) => categoryColor(d.data.name))
      .attr("stroke-opacity", 0.35);

    catG
      .filter((d) => d.r > 44)
      .append("text")
      .attr("class", "cat-label")
      .attr("text-anchor", "middle")
      .attr("y", (d) => -d.r + 13)
      .attr("fill", (d) => categoryColor(d.data.name))
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("stroke", "rgba(7, 8, 13, 0.75)")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text((d) => d.data.name);

    const leaves = root.leaves();
    const dappG = g
      .selectAll("g.dapp")
      .data(leaves)
      .join("g")
      .attr("class", "dapp")
      .attr("data-dapp", (d) => d.data.dapp?.id ?? "")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .attr("tabindex", 0);

    dappG
      .append("circle")
      .attr("r", (d) => Math.max(6, d.r))
      .attr("fill", (d) => categoryColor(d.data.dapp?.group || "Other"))
      .attr("fill-opacity", 0.2)
      .attr("stroke", (d) => categoryColor(d.data.dapp?.group || "Other"))
      .attr("stroke-width", 1.2);

    dappG
      .append("image")
      .attr("href", (d) => d.data.dapp?.logo || "")
      .attr("x", (d) => -d.r * 0.7)
      .attr("y", (d) => -d.r * 0.7)
      .attr("width", (d) => d.r * 1.4)
      .attr("height", (d) => d.r * 1.4)
      .attr("clip-path", (d) => `circle(${d.r * 0.7}px at ${d.r * 0.7}px ${d.r * 0.7}px)`)
      .attr("pointer-events", "none");

    dappG
      .filter((d) => d.r > 22)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", (d) => d.r + 11)
      .attr("fill", "rgba(236,240,255,0.9)")
      .attr("font-size", 10)
      .attr("stroke", "rgba(7, 8, 13, 0.8)")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .attr("pointer-events", "none")
      .text((d) => truncate(d.data.name, 18));

    dappG
      .on("pointerenter", (event, d) => {
        d3.select(event.currentTarget as SVGGElement).select("circle").attr("fill-opacity", 0.38);
        const p = d.data.dapp;
        if (!p) return;
        this.handlers.onHover(
          `<div class="tip-kicker">${esc(p.group)} · ${esc(chainName)}</div>
           <div class="tip-title">${esc(p.name)}</div>
           <div class="tip-metric">${formatCompactUsd(p.chainTvl)} TVL</div>
           <div class="tip-sub">${esc(p.category)}</div>`,
          event.clientX,
          event.clientY,
        );
      })
      .on("pointermove", (event) => this.handlers.onHover("", event.clientX, event.clientY))
      .on("pointerleave", (event) => {
        d3.select(event.currentTarget as SVGGElement).select("circle").attr("fill-opacity", 0.2);
        this.handlers.onHover(null, 0, 0);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        const p = d.data.dapp;
        if (!p) return;
        this.highlightId = p.id;
        this.handlers.onHover(null, 0, 0);
        this.handlers.onSelectProtocol(p.id, chainName);
        pulseSelection(dappG, p.id);
      });

    if (pulseId) pulseSelection(dappG, pulseId);

    this.interior.transition().duration(360).style("opacity", 1);
  }
}

function pulseSelection(
  sel: d3.Selection<d3.BaseType | SVGGElement, d3.HierarchyCircularNode<PackDatum>, SVGGElement, unknown>,
  id: string,
) {
  sel.classed("is-pulse", (d) => d.data.dapp?.id === id);
  sel.select("circle").attr("stroke-width", (d) => (d.data.dapp?.id === id ? 2.4 : 1.2));
}

type PackDatum = { name: string; value?: number; dapp?: ChainDapp; children?: PackDatum[] };

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
