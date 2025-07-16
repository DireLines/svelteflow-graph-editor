import { MarkerType, type Node, type Edge, Position } from "@xyflow/svelte";

export const nodeDefaults = {
  type: "custom",
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  origin: [0.5, 0.5],
};

export const edgeDefaults = {
  style: "stroke-width: 2px;",
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
  },
  zIndex: 10000,
};
