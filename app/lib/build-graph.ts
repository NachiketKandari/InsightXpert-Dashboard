import type { DiagnosisRecord, SankeyNode, SankeyLink } from "./types";

export function buildGraph(records: DiagnosisRecord[]) {
  const nodeMap = new Map<string, { idx: number; name: string; layer: number }>();
  let nextIdx = 0;

  function getNode(name: string, layer: number): number {
    const key = `${layer}:${name}`;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, { idx: nextIdx++, name, layer });
    }
    return nodeMap.get(key)!.idx;
  }

  const linkCounts = new Map<string, number>();

  for (const r of records) {
    const diffIdx = getNode(r.diff, 0);
    const issueIdx = getNode(r.issue, 1);
    const resIdx = getNode(r.resolution, 2);

    const k1 = `${diffIdx}->${issueIdx}`;
    linkCounts.set(k1, (linkCounts.get(k1) || 0) + 1);

    const k2 = `${issueIdx}->${resIdx}`;
    linkCounts.set(k2, (linkCounts.get(k2) || 0) + 1);
  }

  const nodes: SankeyNode[] = Array.from(nodeMap.values()).map((n) => ({
    name: n.name,
    layer: n.layer,
  }));

  const links: SankeyLink[] = [];
  linkCounts.forEach((value, key) => {
    const [s, t] = key.split("->").map(Number);
    links.push({ source: s, target: t, value });
  });

  return { nodes, links };
}
