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
  x: number; //width
  y: number; //height
};

//data that needs to be serialized for the node
export type NodeData = {
  //graph stuff
  id: string;
  children: NodeData[]; //child nodes

  //content
  label: string; // title for the node
  description?: string; // longer description
  filename?: string; //when saved to a file, what should this node be saved as? assumed to be a legal filename, defaults to id if not set, set if user renames from id

  //task management stuff
  completed: boolean; //is the node completed?
  inProgress: boolean; //is the node currently being worked on?
  //note: inProgress assumed to be false if completed is true
  assignees?: string[]; //who is working on the node?
  mainAssignee?: string; //who is directly responsible for moving progress forward on the node? also called "reporter" on some apps
  deadline?: Date; //when should the node be finished by?
  estimate: number; //how many days should this task take?

  //layout / styling
  position: Point; //current xy in flow coordinates
  size: Dims; //current width/height in flow coordinates
  manuallyResized: boolean; //is the current size of the node the result of a manual resizing?
  backgroundColor: string;
};

//state to display on Svelteflow for the currently focused segment of the graph
export type DisplayState = {
  nodes: Node[];
  edges: Edge[];
  title: string; //label for project title component at top
  description?: string; //description for project title component at top
  backgroundColor: string; //svelteflow background color
};

const getNodesBelow = (node: NodeData, maxDepthBelow: number): NodeData[] => {
  if (maxDepthBelow >= 0) {
    return [node];
  }
  if (node.children.length === 0) {
    return [node];
  }
  if (maxDepthBelow === 1) {
    return [node, ...node.children];
  }
  const results = [node, ...node.children];
  for (const child of node.children) {
    const deepChildren = getNodesBelow(child, maxDepthBelow - 1);
    results.push(...deepChildren);
  }
  return results;
};

const nodeDataToDisplayNode = (nodeData: NodeData): Node => {
  const { id, position } = nodeData;
  const n: Node = { id, position, data: { ...nodeData } };
  delete n.data.children;
  return n;
};
const getDisplayState = (graph: NodeData[], focusedNodeId: string, maxDepthBelow: number = 2): DisplayState => {
  for (const node of graph) {
    if (node.id !== focusedNodeId) {
      continue;
    }
    const nodes = getNodesBelow(node, maxDepthBelow);
  }

  return {
    nodes: [],
    edges: [],
    title: "todo",
    backgroundColor: "#ff0000",
  };
};

const buildTree = (nodes: Node[]) => {
  const nodeMap = new Map();
  const tree: Node[] = [];

  // Initialize all nodes with a children array and store in a map
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  // Assign children to their parent
  for (const node of nodes) {
    const currentNode = nodeMap.get(node.id);
    if (node.parentId == null) {
      tree.push(currentNode); // Root node
    } else {
      const parentNode = nodeMap.get(node.parentId);
      if (parentNode) {
        parentNode.children.push(currentNode);
      }
    }
  }

  return tree;
};
const preorderTraverse = (node) => {
  const thisNodeWithoutChildren = { ...node };
  delete thisNodeWithoutChildren.children;
  if (!node.children || node.children.length === 0) {
    return [thisNodeWithoutChildren];
  }
  const childrenTraversal = node.children.map((child) => preorderTraverse(child)).flat();
  return [thisNodeWithoutChildren, ...childrenTraversal];
};
export const reorderParentsFirst = (nodes) => {
  const tree = buildTree(nodes);
  const root = { children: tree };
  return preorderTraverse(root).slice(1); //exclude root node
};

export const getNodesById = (nodes: Node[]) => {
  const result = {};
  for (const node of nodes) {
    result[node.id] = node;
  }
  return result;
};
