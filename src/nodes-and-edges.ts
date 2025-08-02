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

export type Point = {
  x: number;
  y: number;
};
export type Dims = {
  x: number;
  y: number;
};

//data that needs to be serialized for the node
export type NodeData = {
  //graph stuff
  id: string;
  children: string[]; //ids of child nodes

  //content
  label: string; // title for the node
  description?: string; // longer description

  //task management stuff
  completed: boolean; //is the node completed?
  inProgress: boolean; //is the node currently being worked on?
  //note: inProgress assumed to be false if completed is true
  assignees?: string[]; //who is working on the node?
  mainAssignee?: string; //who is directly responsible for moving progress forward on the node? also called "reporter" on some apps
  deadline?: Date; //when should the node be finished by?

  //layout / styling
  position: Point; //current xy in flow coordinates
  size: Dims; //current width/height in flow coordinates
  manuallyResized: boolean; //is the current size of the node the result of a manual resizing?
};
