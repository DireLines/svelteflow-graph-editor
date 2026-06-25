import { create } from "jsondiffpatch";
import { DEFAULT_GRAPH_TITLE, displayStateToGraph, Graph, serializeEdge, TUTORIAL_LABEL } from "./graph";
import { isNil } from "./util";

const jdp = create({
  // Match array items by id field so diffs stay small when nodes/edges shift position
  objectHash: (obj: any) => obj?.id ?? JSON.stringify(obj),
});

const STORAGE_KEY = "graph";
const REVISIONS_KEY = "revisions";
const REVISION_STATE_KEY = "revision";
const MAX_REVISIONS = 1000;
// Storage format v2:
//   REVISIONS_KEY  → { version: 2, entries: [fullState, delta1, delta2, ...] }
//   REVISION_STATE_KEY → { revision: currentIndex, numRevisions: entries.length }
//
// entries[0] is always a full snapshot; entries[i > 0] is a jsondiffpatch delta
// from state[i-1] to state[i].  null delta means no change between saves.

interface RevisionsStore {
  version: 2;
  entries: any[];
}

interface RevisionState {
  revision: number;
  numRevisions: number;
}

const emptyRevisionState: RevisionState = { revision: 0, numRevisions: 1 };
const emptyGraph = new Graph([], [], DEFAULT_GRAPH_TITLE);

// First-load tutorial graph: a single node explaining the basic controls.
const makeTutorialGraph = (): Graph => {
  return new Graph(
    [
      {
        id: "1",
        children: [],
        label: TUTORIAL_LABEL,
        completed: false,
        size: { width: 520, height: 36 },
        position: { x: 0, y: 0 },
        backgroundColor: "#111",
      },
    ],
    [],
    DEFAULT_GRAPH_TITLE,
  );
};

const loadRevisions = (): { store: RevisionsStore; state: RevisionState } => {
  const revisionsJson = localStorage.getItem(REVISIONS_KEY);
  const revisionStateJson = localStorage.getItem(REVISION_STATE_KEY);

  const state: RevisionState = revisionStateJson ? JSON.parse(revisionStateJson) : { ...emptyRevisionState };

  if (!revisionsJson) {
    return {
      store: { version: 2, entries: [JSON.parse(JSON.stringify(emptyGraph))] },
      state: { revision: 0, numRevisions: 1 },
    };
  }

  const parsed = JSON.parse(revisionsJson);

  // Migrate old format: plain array of full snapshots → base + diffs
  if (Array.isArray(parsed) && parsed.length > 0) {
    const entries: any[] = [parsed[0]];
    for (let i = 1; i < parsed.length; i++) {
      entries.push(jdp.diff(parsed[i - 1], parsed[i]) ?? null);
    }
    const revision = Math.min(state.revision, entries.length - 1);
    return {
      store: { version: 2, entries },
      state: { revision, numRevisions: entries.length },
    };
  }

  return { store: parsed as RevisionsStore, state };
};

// Reconstruct full state at targetIndex by replaying diffs from the base.
// Deep-clones entries before patching: jdp.patch inserts delta values by reference
// into the state, so subsequent patches would mutate the delta objects and corrupt
// stored history. Cloning keeps the original entries intact.
const reconstructState = (entries: any[], targetIndex: number): any => {
  const cloned = JSON.parse(JSON.stringify(entries.slice(0, targetIndex + 1)));
  const state = cloned[0];
  for (let i = 1; i <= targetIndex; i++) {
    if (cloned[i] != null) {
      jdp.patch(state, cloned[i]);
    }
  }
  return state;
};

const parseGraphFromState = (parsed: any): Graph =>
  new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);

export const saveGraphToLocalStorage = (graph: Graph, storageKey: string = STORAGE_KEY) => {
  console.log("saveGraphToLocalStorage");
  const logElapsedTime = elapsedTimeLogger("saveGraphToLocalStorage");
  localStorage.setItem(storageKey, JSON.stringify(graph));
  logElapsedTime("save graph");

  {
    const { store, state } = loadRevisions();
    let entries = store.entries;

    // Reconstruct current state so we can diff against it
    const currentState = reconstructState(entries, state.revision);

    // Discard any future entries when writing mid-history
    entries = entries.slice(0, state.revision + 1);

    // Compute and append delta
    const newStateObj = JSON.parse(JSON.stringify(graph));
    const delta = jdp.diff(currentState, newStateObj) ?? null;
    if (delta === null) {
      console.log("no diff - skipping save");
      return;
    }
    entries.push(delta);

    // Trim oldest entries when over MAX_REVISIONS, rebasing to a new full snapshot
    if (entries.length > MAX_REVISIONS) {
      const trimCount = entries.length - MAX_REVISIONS;
      const newBase = reconstructState(entries, trimCount);
      entries = [newBase, ...entries.slice(trimCount + 1)];
    }

    const newRevisionIndex = entries.length - 1;
    const newStore: RevisionsStore = { version: 2, entries };
    const newState: RevisionState = { revision: newRevisionIndex, numRevisions: entries.length };
    localStorage.setItem(REVISIONS_KEY, JSON.stringify(newStore));
    localStorage.setItem(REVISION_STATE_KEY, JSON.stringify(newState));
    logElapsedTime("append revision");
  }
};

export const loadGraphFromLocalStorage = (storageKey: string = STORAGE_KEY): Graph => {
  let initial: Graph;
  try {
    const json = localStorage.getItem(storageKey);
    if (!json) {
      // First load: seed a tutorial node so the canvas isn't blank.
      initial = makeTutorialGraph();
      saveGraphToLocalStorage(initial);
      return initial;
    }
    const parsed = JSON.parse(json);
    initial = new Graph(parsed.nodes, parsed.edges.map(serializeEdge), parsed.title ?? DEFAULT_GRAPH_TITLE);
    if (parsed.nodes.length > 0 && isNil(parsed.nodes[0]?.children)) {
      // old format
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
  return (message: string) => {
    const now = Date.now();
    const elapsed = now - startTimeThisStage;
    startTimeThisStage = now;
    console.log(`${msgPrefix}${message} took ${elapsed} ms`);
  };
};

export const undo = (): Graph => {
  const logElapsedTime = elapsedTimeLogger("undo");
  const { store, state } = loadRevisions();

  if (state.revision > 0) {
    state.revision -= 1;
    localStorage.setItem(REVISION_STATE_KEY, JSON.stringify(state));
  }

  const parsed = reconstructState(store.entries, state.revision);
  logElapsedTime("undo");
  return parseGraphFromState(parsed);
};

export const redo = (): Graph => {
  const logElapsedTime = elapsedTimeLogger("redo");
  const { store, state } = loadRevisions();

  if (state.revision < store.entries.length - 1) {
    state.revision += 1;
    localStorage.setItem(REVISION_STATE_KEY, JSON.stringify(state));
  }

  const parsed = reconstructState(store.entries, state.revision);
  logElapsedTime("redo");
  return parseGraphFromState(parsed);
};

export const getUndoRedoState = () => {
  const revisionStateJson = localStorage.getItem(REVISION_STATE_KEY);
  const revisionState: RevisionState = revisionStateJson ? JSON.parse(revisionStateJson) : emptyRevisionState;
  if (revisionState.numRevisions === 1) {
    return { canUndo: false, canRedo: false };
  }
  return {
    canUndo: revisionState.revision > 0,
    canRedo: revisionState.revision < revisionState.numRevisions - 1,
  };
};
