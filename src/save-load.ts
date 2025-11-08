import { DEFAULT_GRAPH_TITLE, displayStateToGraph, Graph, serializeEdge } from "./nodes-and-edges";
import { isNil } from "./util";

const STORAGE_KEY = "graph";
const REVISIONS_KEY = "revisions";
export const saveGraphToLocalStorage = (graph: Graph, storageKey: string = STORAGE_KEY) => {
  console.log("saveGraphToLocalStorage");
  localStorage.setItem(storageKey, JSON.stringify(graph));

  {
    //append new revision
    const revisionsJson = localStorage.getItem(REVISIONS_KEY);
    const revisionState = revisionsJson ? JSON.parse(revisionsJson) : { revisions: [], revisionNumber: -1 };
    if (revisionState.revisionNumber < revisionState.revisions.length - 1 && revisionState.revisions.length > 0) {
      revisionState.revisions = revisionState.revisions.slice(0, revisionState.revisionNumber);
    }
    revisionState.revisions.push(graph);
    revisionState.revisionNumber += 1;
    localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisionState));
  }
};
export const loadGraphFromLocalStorage = (storageKey: string = STORAGE_KEY): Graph => {
  //TODO: query whether undos/redos are possible as well
  let initial: Graph;
  const empty = { nodes: [], edges: [] };
  try {
    const json = localStorage.getItem(storageKey);
    const parsed = json ? JSON.parse(json) : empty;
    initial = new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);
    if (parsed.nodes.length > 0 && isNil(parsed.nodes[0]?.children)) {
      //old format
      initial = displayStateToGraph(parsed);
      saveGraphToLocalStorage(initial);
    }
  } catch {
    initial = new Graph([], [], DEFAULT_GRAPH_TITLE);
  }
  return initial;
};

export const undo = (): Graph => {
  const revisionsJson = localStorage.getItem(REVISIONS_KEY);
  const revisionState = revisionsJson ? JSON.parse(revisionsJson) : { revisions: [], revisionNumber: -1 };
  //TODO: handle no more undo steps
  revisionState.revisionNumber -= 1;
  localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisionState));
  return revisionState.revisions[revisionState.revisionNumber];
};

export const redo = (): Graph => {
  const revisionsJson = localStorage.getItem(REVISIONS_KEY);
  const revisionState = revisionsJson ? JSON.parse(revisionsJson) : { revisions: [], revisionNumber: -1 };
  //TODO: handle no more redo steps
  revisionState.revisionNumber += 1;
  localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisionState));
  return revisionState.revisions[revisionState.revisionNumber];
};
