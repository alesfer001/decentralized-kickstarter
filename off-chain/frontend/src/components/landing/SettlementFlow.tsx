"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";

/** Below this container width the diagram runs top to bottom instead of left to right */
const NARROW_WIDTH = 520;

type Tone = "cell" | "neutral" | "ok" | "bad";

interface StepData extends Record<string, unknown> {
  title: string;
  detail: string;
  tone: Tone;
  vertical: boolean;
}

const TONE_CLASS: Record<Tone, string> = {
  cell: "bg-cell-soft border-cell",
  neutral: "bg-surface-3 border-line",
  ok: "bg-ok-soft border-ok",
  bad: "bg-bad-soft border-bad",
};

/** Invisible connection points; edges attach to them but the reader never sees them */
const HANDLE = "!w-1 !h-1 !min-w-0 !min-h-0 !border-0 !bg-transparent";

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const { vertical } = data;
  return (
    <div
      className={`rounded-[10px] border py-2.5 text-center ${vertical ? "w-[140px] px-2" : "w-[180px] px-3"} ${TONE_CLASS[data.tone]}`}
    >
      <Handle type="target" id="in" position={vertical ? Position.Top : Position.Left} className={HANDLE} />
      <div className="font-bold text-xs text-ink">{data.title}</div>
      <div className="font-mono text-[11px] text-ink-2 mt-0.5">{data.detail}</div>
      <Handle type="source" id="out" position={vertical ? Position.Bottom : Position.Right} className={HANDLE} />
      {/* Extra sides for the fail-safe edge, so it stays clear of the main path */}
      <Handle type="source" id="side-out" position={vertical ? Position.Right : Position.Bottom} className={HANDLE} />
      <Handle type="target" id="side-in" position={vertical ? Position.Top : Position.Bottom} className={HANDLE} />
    </div>
  );
}

const NODE_TYPES = { step: StepNode };

/** Node positions for each orientation; React Flow scales the result to fit the container */
const LAYOUT = {
  wide: { pledges: [0, 95], finalize: [240, 95], creator: [490, 0], backers: [490, 190] },
  narrow: { pledges: [77, 0], finalize: [77, 110], creator: [0, 230], backers: [155, 230] },
} as const;

function buildGraph(vertical: boolean): { nodes: Node<StepData>[]; edges: Edge[] } {
  const pos = LAYOUT[vertical ? "narrow" : "wide"];
  const node = (id: keyof typeof pos, title: string, detail: string, tone: Tone): Node<StepData> => ({
    id,
    type: "step",
    position: { x: pos[id][0], y: pos[id][1] },
    data: { title, detail, tone, vertical },
  });

  const arrow = (color: string) => ({ type: MarkerType.ArrowClosed, color, width: 16, height: 16 });
  const label = (color: string) => ({
    labelStyle: { fill: color, fontFamily: "var(--font-jetbrains-mono)", fontSize: 11 },
    labelBgStyle: { fill: "var(--surface-2)" },
    labelBgPadding: [4, 2] as [number, number],
  });

  return {
    nodes: [
      node("pledges", "Pledge cells", "locked until deadline", "cell"),
      node("finalize", "Finalize", "total ≥ goal?", "neutral"),
      node("creator", "Creator", "release · Funded", "ok"),
      node("backers", "Each backer", "refund · Unsuccessful", "bad"),
    ],
    edges: [
      {
        id: "pledges-finalize",
        source: "pledges",
        sourceHandle: "out",
        target: "finalize",
        targetHandle: "in",
        style: { stroke: "var(--ink-3)", strokeWidth: 1.5 },
        markerEnd: arrow("var(--ink-3)"),
      },
      {
        id: "finalize-creator",
        source: "finalize",
        sourceHandle: "out",
        target: "creator",
        targetHandle: "in",
        label: "yes",
        style: { stroke: "var(--ok)", strokeWidth: 1.5 },
        markerEnd: arrow("var(--ok)"),
        ...label("var(--ok)"),
      },
      {
        id: "finalize-backers",
        source: "finalize",
        sourceHandle: "out",
        target: "backers",
        targetHandle: "in",
        label: "no",
        style: { stroke: "var(--bad)", strokeWidth: 1.5 },
        markerEnd: arrow("var(--bad)"),
        ...label("var(--bad)"),
      },
      {
        id: "pledges-backers-failsafe",
        source: "pledges",
        sourceHandle: "side-out",
        target: "backers",
        targetHandle: "side-in",
        // Wide: a squared loop under the main path. Narrow: a curve beside it, since
        // fitView only fits nodes and a loop outside them would be clipped
        type: vertical ? "default" : "smoothstep",
        label: vertical ? "fail-safe" : "fail-safe · ~180 days",
        style: { stroke: "var(--ink-3)", strokeWidth: 1.25, strokeDasharray: "4 4" },
        markerEnd: arrow("var(--ink-3)"),
        ...label("var(--ink-3)"),
      },
    ],
  };
}

const FIT = { padding: 0.08 };

function Flow({ vertical, width }: { vertical: boolean; width: number }) {
  const { fitView } = useReactFlow();
  const { nodes, edges } = useMemo(() => buildGraph(vertical), [vertical]);

  // The fitView prop only fits once, on mount; keep the picture fitted as the tile resizes
  useEffect(() => {
    fitView(FIT);
  }, [width, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={FIT}
      // A picture, not an editor: no dragging, panning, zooming or selecting
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      panOnDrag={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
    />
  );
}

/**
 * Where a pledge cell can go after the deadline: to the creator on a verified Success, back to
 * each backer on a verified Failed, and back to the backer through the grace-period fail-safe.
 */
export function SettlementFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const vertical = width > 0 && width < NARROW_WIDTH;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Diagram: after the deadline, pledge cells are finalized. If the total meets the goal they are released to the creator, otherwise refunded to each backer. After about 180 days, any unsettled pledge can be returned to its backer."
      className={`mt-2 w-full ${vertical ? "h-[330px]" : "h-[290px]"}`}
    >
      {/* Remount on an orientation flip so the initial fit runs against the new, measured nodes */}
      <ReactFlowProvider key={vertical ? "vertical" : "horizontal"}>
        <Flow vertical={vertical} width={width} />
      </ReactFlowProvider>
    </div>
  );
}
