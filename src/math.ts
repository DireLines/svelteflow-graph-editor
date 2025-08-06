import { type XYPosition } from "@xyflow/svelte";

export const addPositions = (a: XYPosition, b: XYPosition) => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const subPositions = (a: XYPosition, b: XYPosition) => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
