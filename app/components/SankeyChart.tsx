"use client";

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyLeft,
} from "d3-sankey";
import type { DiagnosisRecord } from "../lib/types";
import { buildGraph } from "../lib/build-graph";
import { nodeColor } from "../lib/colors";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SankeySelection {
  type: "node" | "link";
  layer?: number; // 0=diff, 1=issue, 2=resolution
  name?: string;
  source?: string;
  sourceLayer?: number;
  target?: string;
  targetLayer?: number;
}

interface Props {
  data: DiagnosisRecord[];
  selection: SankeySelection | null;
  onSelect: (s: SankeySelection | null) => void;
}

export default function SankeyChart({ data, selection, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Stable ref so d3 event handlers always see latest selection
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const showTip = useCallback((e: MouseEvent, text: string) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.textContent = text;
    tip.style.opacity = "1";
    tip.style.left = e.pageX + 14 + "px";
    tip.style.top = e.pageY - 16 + "px";
  }, []);

  const moveTip = useCallback((e: MouseEvent) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.style.left = e.pageX + 14 + "px";
    tip.style.top = e.pageY - 16 + "px";
  }, []);

  const hideTip = useCallback(() => {
    const tip = tooltipRef.current;
    if (tip) tip.style.opacity = "0";
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 500;
    const margin = { top: 10, right: 200, bottom: 10, left: 140 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const { nodes, links } = buildGraph(data);

    const sankeyGen = (d3Sankey as any)()
      .nodeId((_d: any, i: number) => i)
      .nodeWidth(18)
      .nodePadding(10)
      .nodeAlign(sankeyLeft)
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ]);

    const graph = sankeyGen({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    });

    // --- Links ---
    const linkG = svg.append("g").attr("class", "links");
    const linkPaths = linkG
      .selectAll("path")
      .data(graph.links as any[])
      .join("path")
      .attr("d", sankeyLinkHorizontal() as any)
      .attr("fill", "none")
      .attr("stroke", (d: any) => nodeColor(d.source.name, d.source.layer))
      .attr("stroke-width", (d: any) => Math.max(1, d.width || 0))
      .attr("stroke-opacity", 0.25)
      .style("cursor", "pointer")
      .on("mouseenter", function (event: MouseEvent, d: any) {
        d3.select(this).attr("stroke-opacity", 0.55);
        showTip(
          event,
          `${d.source.name} → ${d.target.name} — ${d.value} questions`
        );
      })
      .on("mousemove", (_e: MouseEvent) => moveTip(_e))
      .on("mouseleave", function () {
        d3.select(this).attr("stroke-opacity", isLinkSelected(d3.select(this).datum()) ? 0.7 : 0.25);
        hideTip();
      })
      .on("click", function (_event: MouseEvent, d: any) {
        const cur = selectionRef.current;
        const isSame =
          cur?.type === "link" &&
          cur.source === d.source.name &&
          cur.target === d.target.name;
        if (isSame) {
          onSelect(null);
        } else {
          onSelect({
            type: "link",
            source: d.source.name,
            sourceLayer: d.source.layer,
            target: d.target.name,
            targetLayer: d.target.layer,
          });
        }
      });

    // --- Nodes ---
    const nodeG = svg
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graph.nodes as any[])
      .join("g");

    const rects = nodeG
      .append("rect")
      .attr("x", (d: any) => d.x0)
      .attr("y", (d: any) => d.y0)
      .attr("height", (d: any) => Math.max(1, d.y1 - d.y0))
      .attr("width", sankeyGen.nodeWidth())
      .attr("fill", (d: any) => nodeColor(d.name, d.layer))
      .attr("rx", 3)
      .style("cursor", "pointer")
      .on("mouseenter", function (event: MouseEvent, d: any) {
        showTip(event, `${d.name} — ${d.value} questions`);
      })
      .on("mousemove", (_e: MouseEvent) => moveTip(_e))
      .on("mouseleave", () => hideTip())
      .on("click", function (_event: MouseEvent, d: any) {
        const cur = selectionRef.current;
        const isSame =
          cur?.type === "node" && cur.name === d.name && cur.layer === d.layer;
        onSelect(isSame ? null : { type: "node", layer: d.layer, name: d.name });
      });

    const labels = nodeG
      .append("text")
      .attr("x", (d: any) => (d.x0 < width / 2 ? d.x0 - 6 : d.x1 + 6))
      .attr("y", (d: any) => (d.y0 + d.y1) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d: any) => (d.x0 < width / 2 ? "end" : "start"))
      .attr("fill", "#c9d1d9")
      .attr("font-size", 11)
      .style("pointer-events", "none")
      .text((d: any) => `${d.name} (${d.value})`);

    // --- Drag ---
    const drag = d3
      .drag<SVGRectElement, any>()
      .on("start", function () {
        d3.select(this.parentNode as any).raise();
      })
      .on("drag", function (event: any, d: any) {
        const dy = event.dy;
        d.y0 += dy;
        d.y1 += dy;

        d3.select(this)
          .attr("y", d.y0);

        // Move label
        d3.select(this.parentNode as any)
          .select("text")
          .attr("y", (d.y0 + d.y1) / 2);

        // Re-compute link paths
        sankeyGen.update(graph);
        linkPaths.attr("d", sankeyLinkHorizontal() as any);
      });

    rects.call(drag);

    // --- Selection highlight helper ---
    function isLinkSelected(d: any): boolean {
      const sel = selectionRef.current;
      if (!sel) return false;
      if (sel.type === "link") {
        return d.source.name === sel.source && d.target.name === sel.target;
      }
      if (sel.type === "node") {
        return (
          (d.source.name === sel.name && d.source.layer === sel.layer) ||
          (d.target.name === sel.name && d.target.layer === sel.layer)
        );
      }
      return false;
    }

    function isNodeSelected(d: any): boolean {
      const sel = selectionRef.current;
      if (!sel) return false;
      if (sel.type === "node") {
        return d.name === sel.name && d.layer === sel.layer;
      }
      if (sel.type === "link") {
        return (
          (d.name === sel.source && d.layer === sel.sourceLayer) ||
          (d.name === sel.target && d.layer === sel.targetLayer)
        );
      }
      return false;
    }

    function applyHighlights() {
      const hasSel = !!selectionRef.current;
      linkPaths
        .attr("stroke-opacity", (d: any) =>
          hasSel ? (isLinkSelected(d) ? 0.7 : 0.08) : 0.25
        );
      rects
        .attr("opacity", (d: any) =>
          hasSel ? (isNodeSelected(d) ? 1 : 0.3) : 1
        );
      labels
        .attr("opacity", (d: any) =>
          hasSel ? (isNodeSelected(d) ? 1 : 0.3) : 1
        );
    }

    // Store applyHighlights on the SVG element so we can call it from outside
    (svgRef.current as any).__applyHighlights = applyHighlights;
    applyHighlights();
  }, [data, showTip, moveTip, hideTip, onSelect]);

  // Re-apply highlights when selection changes (without full re-render)
  useEffect(() => {
    if (svgRef.current && (svgRef.current as any).__applyHighlights) {
      (svgRef.current as any).__applyHighlights();
    }
  }, [selection]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <svg ref={svgRef} className="block" />
      <div
        ref={tooltipRef}
        className="fixed z-[100] rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 pointer-events-none opacity-0 transition-opacity duration-100"
      />
    </div>
  );
}
