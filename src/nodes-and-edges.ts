import { MarkerType, type Node, type Edge, Position } from "@xyflow/svelte";
import { isNil } from "./util";

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
  width: number;
  height: number;
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
  inProgress?: boolean; //is the node currently being worked on?
  //note: inProgress assumed to be false if completed is true
  assignees?: string[]; //who is working on the node?
  mainAssignee?: string; //who is directly responsible for moving progress forward on the node? also called "reporter" on some apps
  deadline?: Date; //when should the node be finished by?
  estimate?: number; //how many days should this task take?

  //layout / styling
  position: Point; //current xy in flow coordinates
  size: Dims; //current width/height in flow coordinates
  lastManualResize?: Dims; //what was the size at the end of last manual resizing?
  backgroundColor: string;

  //redundant info - not stored, only used at runtime
  parentId?: string; //parent node
  completionStatus?: number;
};
//state to display on Svelteflow for the currently focused segment of the graph
export type DisplayState = {
  nodes: Node[];
  edges: Edge[];
  title: string; //label for project title component at top
  description?: string; //description for project title component at top
  backgroundColor: string; //svelteflow background color
};

export function* preorderTraverse(nodes: readonly NodeData[]): IterableIterator<NodeData> {
  const stack: NodeData[] = [...nodes].reverse(); // process first node first
  while (stack.length) {
    const node = stack.pop()!;
    yield node;
    if (node.children?.length) {
      // push children in reverse order so the first child is processed next
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}

function removeFirstMatch(arr: any[], match: (x: any) => boolean) {
  for (let i = 0; i < arr.length; i++) {
    if (match(arr[i])) {
      arr.splice(i, 1);
    }
  }
  return arr;
}
//backend graph
export class Graph {
  nodes: NodeData[];
  edges: Edge[];
  constructor(nodes: NodeData[], edges: Edge[]) {
    this.nodes = nodes;
    this.edges = edges;
  }
  addNode(node: NodeData, parentId: string | null) {
    if (isNil(parentId)) {
      this.nodes.push(node);
      return;
    }
    const parent = this.getNode(parentId as string);
    if (parent === null) {
      console.error("tried to create a node with bogus parent id", parentId);
      return;
    }
    parent?.children.push(node);
  }
  refreshParentIds() {
    //TODO(perf): keep flag for whether parent ids could have changed since last refresh, skip if not
    for (const node of this.nodes) {
      node.parentId = undefined;
      this.refreshParentIdsUnderNode(node);
    }
  }
  refreshParentIdsUnderNode(currNode: NodeData) {
    for (const child of currNode.children) {
      child.parentId = currNode.id;
      this.refreshParentIdsUnderNode(child);
    }
  }
  refreshCompletionStatus() {
    //TODO(perf): keep flag for whether completion status could have changed since last refresh, skip if not
    for (const node of this.nodes) {
      this.refreshCompletionStatusUnderNode(node);
    }
  }
  refreshCompletionStatusUnderNode(currNode: NodeData): number {
    if (currNode.children.length === 0) {
      const status = currNode.completed ? 1 : 0;
      currNode.completionStatus = status;
      return status;
    }
    let sumCompletionStatus = 0;
    for (const child of currNode.children) {
      sumCompletionStatus += this.refreshCompletionStatusUnderNode(child);
    }
    const status = sumCompletionStatus / currNode.children.length;
    currNode.completionStatus = status;
    return status;
  }
  getCompletionStatus(nodeId: string): number {
    this.refreshCompletionStatus();
    return this.getNode(nodeId)?.completionStatus ?? 0;
  }
  getNode(nodeId: string): NodeData | null {
    for (const node of preorderTraverse(this.nodes)) {
      if (node.id === nodeId) {
        return node;
      }
    }
    return null;
  }
  getParent(nodeId: string): NodeData | null {
    for (const node of preorderTraverse(this.nodes)) {
      for (const child of node.children) {
        if (child.id === nodeId) {
          return node;
        }
      }
    }
    return null;
  }
  updateNode(nodeId: string, changes: Partial<NodeData>) {
    const node = this.getNode(nodeId);
    if (node === null) {
      console.error("tried to modify a node with bogus id", nodeId);
      return;
    }
    for (const k in changes) {
      node[k] = changes[k];
    }
  }
  deleteNode(nodeId: string) {
    const node = this.getNode(nodeId);
    if (node === null) {
      console.error("tried to delete a node with bogus id", nodeId);
      return;
    }
    const parent = this.getParent(nodeId);
    let nodesToSearch = this.nodes;
    if (parent !== null) {
      nodesToSearch = parent.children;
    }
    removeFirstMatch(nodesToSearch, (n) => n.id === nodeId);
    this.edges = this.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  }
  addEdge(edge: Edge) {
    this.edges.push(edge);
  }
  deleteEdge(edgeId: string) {
    removeFirstMatch(this.edges, (e) => e.id === edgeId);
  }
  reparent(oldParentId: string | null, newParentId: string | null, childId: string) {
    const child = this.getNode(childId);
    if (child === null) {
      console.error("tried to reparent", childId, "but no node with that id exists");
      return;
    }
    const childCopy = { ...child };
    if (!isNil(oldParentId)) {
      const oldParent = this.getNode(oldParentId as string);
      if (oldParent !== null) {
        oldParent.children = oldParent.children.filter((n) => n.id !== childId);
      }
    } else {
      //moving out of top level
      removeFirstMatch(this.nodes, (n) => n.id === childId);
    }

    if (newParentId !== null) {
      const newParent = this.getNode(newParentId);
      if (newParent === null) {
        console.error(
          "tried to make",
          newParentId,
          "the parent of",
          childId,
          "but node",
          newParentId,
          "does not exist"
        );
      } else {
        newParent.children.push(childCopy);
      }
    } else {
      //moving into top level
      this.nodes.push(childCopy);
    }
  }
  getIncomingNodes(nodeId: string): string[] {
    const result = [];
    for (const edge of this.edges) {
      if (edge.target === nodeId) {
        result.push(edge.source);
      }
    }
    return result;
  }
  getOutgoingNodes(nodeId: string): string[] {
    const result = [];
    for (const edge of this.edges) {
      if (edge.source === nodeId) {
        result.push(edge.target);
      }
    }
    return result;
  }
  isWorkable(nodeId: string): boolean {
    this.refreshParentIds();
    const node = this.getNode(nodeId);
    if (node && node.completed) {
      return false;
    }
    const incoming = this.getIncomingNodes(nodeId);
    for (const incomingId of incoming) {
      if (!this.isCompletedOrParentCompleted(incomingId)) {
        return false;
      }
    }
    if (!node?.parentId) {
      return true;
    }
    return this.isWorkable(node?.parentId);
  }
  isCompletedOrParentCompleted(nodeId: string): boolean {
    this.refreshParentIds();
    const node = this.getNode(nodeId);
    if (!node) {
      return false;
    }
    if (node.completed) {
      return true;
    }
    if (isNil(node.parentId === null)) {
      //not completed, and at root level
      return false;
    }
    //depends on parent
    return this.isCompletedOrParentCompleted(node.parentId);
  }
  getDisplayState(focusedNodeId: string | null, maxDepthBelow: number = Infinity): DisplayState | null {
    const result: DisplayState = {
      nodes: [],
      edges: [],
      title: "My Graph",
      description: "right-click to make a new node. left click to drag or edit nodes",
      backgroundColor: "#111",
    };
    this.refreshParentIds();

    const { nodes, edges } = this;
    if (focusedNodeId === null) {
      //just doing from root of the graph
      result.nodes.push(...nodes.map(nodeDataToNode));
      for (const node of nodes) {
        const nodesBelow = getNodesBelow(node, maxDepthBelow);
        result.nodes.push(...nodesBelow.map(nodeDataToNode));
      }
    } else {
      let foundNode = false;
      const preorder = preorderTraverse(nodes);
      for (const node of preorder) {
        if (node.id === focusedNodeId) {
          //since node ids are maintained to be unique, correct to break after first encountered node with id
          foundNode = true;
          const nodesBelow = getNodesBelow(node, maxDepthBelow);
          console.log("nodesBelow", nodesBelow);
          result.nodes.push(
            ...nodesBelow.map(nodeDataToNode).map((n) => {
              //if direct child of focused node, display as if not parented
              if (n.parentId === focusedNodeId) {
                return { ...n, parentId: undefined };
              }
              return n;
            })
          );
          result.title = node.label;
          result.description = node.description;
          result.backgroundColor = node.backgroundColor;
          break;
        }
      }
      if (!foundNode) {
        //bogus focusedNodeId - fail
        return null;
      }
    }

    const nodesById = getNodesById(result.nodes);
    for (const edge of edges) {
      if (edge.source in nodesById || edge.target in nodesById) {
        result.edges.push(addDefaultsToEdge(edge));
      }
    }
    for (const node of result.nodes) {
      if (this.isCompletedOrParentCompleted(node.id)) {
        node.style = "border-color: #49954aff";
      }
      if (this.isWorkable(node.id)) {
        node.style = "border-color: #f7b423ff;border-width:3px;";
      }
    }
    return result;
  }
}

const getNodesBelow = (node: NodeData, maxDepthBelow: number = Infinity): NodeData[] => {
  if (maxDepthBelow <= 0) {
    return [];
  }
  const results = [];
  results.push(...node.children);
  for (const child of node.children) {
    const deepChildren = getNodesBelow(child, maxDepthBelow - 1);
    results.push(...deepChildren);
  }
  return results;
};

//note: since parent/child relationships between nodes are encoded in 2 different ways in the nested vs flat graph,
// this conversion loses that info. It should be re-added
const nodeDataToNode = (nodeData: NodeData): Node => {
  const { id, position, size, parentId } = nodeData;
  const { width, height } = size;

  const n: Node = {
    id,
    position,
    parentId,
    measured: { width, height },
    data: { ...nodeData },
    ...nodeDefaults,
  };
  if (!isNil(nodeData.lastManualResize) || nodeData.children.length > 0) {
    n.width = width;
    n.height = height;
  }
  delete n.data.children;
  return n;
};
const nodeToNodeData = (node: Node): NodeData => {
  const { id, position, measured, height, width, data } = node;
  const n: any = {
    id,
    position,
    children: [],
    size: { x: width ?? measured?.width, y: height ?? measured?.height },
    ...data,
  };
  //TODO: keep only NodeData keys
  return n;
};

//only needed for converting graph stored in old format to new format
export const displayStateToGraph = (displayState: DisplayState): Graph => {
  console.log("displayStateToGraph");
  const nodeMap = new Map();
  const result: Graph = new Graph([], []);

  // Initialize all nodes with a children array and store in a map
  for (const node of displayState.nodes) {
    nodeMap.set(node.id, nodeToNodeData(node));
  }

  // Assign children to their parent
  for (const node of displayState.nodes) {
    const currentNode = nodeMap.get(node.id);
    if (node.parentId == null) {
      result.nodes.push(currentNode); // Root node
    } else {
      const parentNode = nodeMap.get(node.parentId);
      if (parentNode) {
        parentNode.children.push(currentNode);
      }
    }
  }

  result.edges = [...displayState.edges.map(serializeEdge)];
  return result;
};

export const getNodesById = (nodes: Node[]) => {
  const result = {};
  for (const node of nodes) {
    result[node.id] = node;
  }
  return result;
};

export const addDefaultsToEdge = (edge: Edge) => {
  return { ...edge, ...edgeDefaults };
};

export const serializeEdge = (edge: Edge) => {
  const { source, target, id } = edge;
  return { source, target, id };
};
