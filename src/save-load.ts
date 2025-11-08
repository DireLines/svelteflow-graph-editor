import { DEFAULT_GRAPH_TITLE, displayStateToGraph, Graph, serializeEdge } from "./nodes-and-edges";
import { isNil } from "./util";

const STORAGE_KEY = "graph";
const REVISIONS_KEY = "revisions";
const REVISION_NUMBER_KEY = "revision";
const emptyGraph = new Graph([], [], DEFAULT_GRAPH_TITLE);
const emptyRevisions = [emptyGraph];

export const saveGraphToLocalStorage = (graph: Graph, storageKey: string = STORAGE_KEY) => {
  console.log("saveGraphToLocalStorage");
  const logElapsedTime = elapsedTimeLogger("saveGraphToLocalStorage");
  localStorage.setItem(storageKey, JSON.stringify(graph));
  logElapsedTime("save graph");

  {
    //append new revision
    const revisionsJson = localStorage.getItem(REVISIONS_KEY);
    const revisionState = revisionsJson ? JSON.parse(revisionsJson) : emptyRevisions;
    if (revisionState.revisionNumber < revisionState.revisions.length - 1 && revisionState.revisions.length > 0) {
      revisionState.revisions = revisionState.revisions.slice(0, revisionState.revisionNumber + 1);
    }
    revisionState.revisions.push(graph);
    revisionState.revisionNumber = revisionState.revisions.length - 1;
    localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisionState));
    logElapsedTime("append revision");
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

const elapsedTimeLogger = (prefix: string) => {
  let startTimeThisStage = Date.now();
  const msgPrefix = prefix ? `${prefix}: ` : "";
  return (message) => {
    const now = Date.now();
    const elapsed = now - startTimeThisStage;
    startTimeThisStage = now;
    console.log(`${msgPrefix}${message} took ${elapsed} ms`);
  };
};

export const undo = (): Graph => {
  const logElapsedTime = elapsedTimeLogger("undo");
  const revisionsJson = localStorage.getItem(REVISIONS_KEY);
  const revisionState = revisionsJson ? JSON.parse(revisionsJson) : emptyRevisions;
  if (revisionState.revisionNumber > 0) {
    revisionState.revisionNumber -= 1;
    localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisionState));
  }
  const parsed = revisionState.revisions[revisionState.revisionNumber];
  logElapsedTime("undo");
  return new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);
};

export const redo = (): Graph => {
  const logElapsedTime = elapsedTimeLogger("redo");
  const revisionsJson = localStorage.getItem(REVISIONS_KEY);
  const revisionState = revisionsJson ? JSON.parse(revisionsJson) : emptyRevisions;
  if (revisionState.revisionNumber < revisionState.revisions.length - 1) {
    revisionState.revisionNumber += 1;
    localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisionState));
  }
  const parsed = revisionState.revisions[revisionState.revisionNumber];
  logElapsedTime("redo");
  return new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);
};
