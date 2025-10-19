import { type XYPosition, type Rect, type Node } from "@xyflow/svelte";

export const addPositions = (a: XYPosition, b: XYPosition) => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const subPositions = (a: XYPosition, b: XYPosition) => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const getNodeRectFlowCoordinates = (n: Node, resizedNodesById: any = {}): Rect => {
  return {
    ...n.position,
    width: n.width ?? n.measured?.width ?? 0,
    height: n.height ?? n.measured?.height ?? 0,
  };
};
export const getBoundingRect = (rects: Rect[]): Rect => {
  const min: XYPosition = { x: Infinity, y: Infinity };
  const max: XYPosition = { x: -Infinity, y: -Infinity };
  if (rects.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }
  for (const rect of rects) {
    min.x = Math.min(min.x, rect.x);
    min.y = Math.min(min.y, rect.y);
    max.x = Math.max(max.x, rect.x + rect.width);
    max.y = Math.max(max.y, rect.y + rect.height);
  }
  return {
    x: min.x,
    y: min.y,
    width: max.x - min.x,
    height: max.y - min.y,
  };
};
