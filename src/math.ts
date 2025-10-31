import { type XYPosition, type Rect, type Node } from "@xyflow/svelte";
import { nodeDefaults } from "./nodes-and-edges";

export const addPositions = (a: XYPosition, b: XYPosition) => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const subPositions = (a: XYPosition, b: XYPosition) => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

//not getting in flow coordinates, getting local to parent
export const getNodeRectLocalCoordinates = (n: Node, resizedNodesById: any = {}): Rect => {
  if (n.id in resizedNodesById) {
    return resizedNodesById[n.id];
  }
  return {
    ...n.position,
    width: n.width ?? n.measured?.width ?? 0,
    height: n.height ?? n.measured?.height ?? 0,
  };
};

export const getBoundingRect = (rects: Rect[]): Rect => {
  const origin = nodeDefaults.origin;
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
    const topLeft = { x: rect.x - rect.width * origin[0], y: rect.y - rect.height * origin[1] };
    min.x = Math.min(min.x, topLeft.x);
    min.y = Math.min(min.y, topLeft.y);
    max.x = Math.max(max.x, topLeft.x + rect.width);
    max.y = Math.max(max.y, topLeft.y + rect.height);
  }
  const rectTopLeft = {
    x: min.x,
    y: min.y,
    width: max.x - min.x,
    height: max.y - min.y,
  };
  return {
    x: rectTopLeft.x - rectTopLeft.width * origin[0],
    y: rectTopLeft.y - rectTopLeft.height * origin[0],
    width: rectTopLeft.width,
    height: rectTopLeft.height,
  };
};
