import { DEFAULT_GRAPH_TITLE, displayStateToGraph, Graph, serializeEdge } from "./nodes-and-edges";
import { isNil } from "./util";

const STORAGE_KEY = "graph";
const REVISIONS_KEY = "revisions";
const REVISION_STATE_KEY = "revision";
const MAX_REVISIONS = 50;
const emptyGraph = new Graph([], [], DEFAULT_GRAPH_TITLE);
const emptyRevisions = [emptyGraph];
const emptyRevisionState = { revision: 0, numRevisions: 1 };

export const saveGraphToLocalStorage = (graph: Graph, storageKey: string = STORAGE_KEY) => {
  console.log("saveGraphToLocalStorage");
  const logElapsedTime = elapsedTimeLogger("saveGraphToLocalStorage");
  localStorage.setItem(storageKey, JSON.stringify(graph));
  logElapsedTime("save graph");

  {
    //append new revision
    const revisionsJson = localStorage.getItem(REVISIONS_KEY);
    const revisionStateJson = localStorage.getItem(REVISION_STATE_KEY);
    let revisions = revisionsJson ? JSON.parse(revisionsJson) : emptyRevisions;
    let revisionState = revisionStateJson ? JSON.parse(revisionStateJson) : emptyRevisionState;
    //if appending in the middle, forget revision history after this point
    if (revisionState.revision < revisions.length - 1 && revisions.length > 0) {
      revisions = revisions.slice(0, revisionState.revision + 1);
    }
    revisions.push(graph); //add revision
    revisions = revisions.slice(-MAX_REVISIONS); //only keep last MAX_REVISIONS revisions
    revisionState = { revision: revisions.length - 1, numRevisions: revisions.length };
    localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisions));
    localStorage.setItem(REVISION_STATE_KEY, JSON.stringify(revisionState));
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
  const revisionStateJson = localStorage.getItem(REVISION_STATE_KEY);
  let revisions = revisionsJson ? JSON.parse(revisionsJson) : emptyRevisions;
  let revisionState = revisionStateJson ? JSON.parse(revisionStateJson) : emptyRevisionState;
  if (revisionState.revision > 0) {
    revisionState.revision -= 1;
    localStorage.setItem(REVISION_STATE_KEY, JSON.stringify(revisionState));
  }
  const parsed = revisions[revisionState.revision];
  logElapsedTime("undo");
  return new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);
};

export const redo = (): Graph => {
  const logElapsedTime = elapsedTimeLogger("redo");
  const revisionsJson = localStorage.getItem(REVISIONS_KEY);
  const revisionStateJson = localStorage.getItem(REVISION_STATE_KEY);
  let revisions = revisionsJson ? JSON.parse(revisionsJson) : emptyRevisions;
  let revisionState = revisionStateJson ? JSON.parse(revisionStateJson) : emptyRevisionState;
  if (revisionState.revision < revisions.length - 1) {
    revisionState.revision += 1;
    localStorage.setItem(REVISION_STATE_KEY, JSON.stringify(revisionState));
  }
  const parsed = revisions[revisionState.revision];
  logElapsedTime("redo");
  return new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);
};

export const getUndoRedoState = () => {
  const revisionStateJson = localStorage.getItem(REVISION_STATE_KEY);
  let revisionState = revisionStateJson ? JSON.parse(revisionStateJson) : emptyRevisionState;
  if (revisionState.numRevisions === 1) {
    return { canUndo: false, canRedo: false };
  }
  return { canUndo: revisionState.revision > 0, canRedo: revisionState.revision < revisionState.numRevisions - 1 };
};
