import { displayStateToGraph, Graph } from "./nodes-and-edges";

const STORAGE_KEY = "graph";
export const saveGraphToLocalStorage = (graph: Graph, storageKey: string = STORAGE_KEY) => {
  localStorage.setItem(storageKey, JSON.stringify(graph, null, 2));
};
export const loadGraphFromLocalStorage = (storageKey: string = STORAGE_KEY): Graph => {
  let initial: Graph;
  const empty = { nodes: [], edges: [] };
  try {
    const json = localStorage.getItem(storageKey);
    const parsed = json ? JSON.parse(json) : empty;
    initial = new Graph(parsed.nodes, parsed.edges);
    if (parsed.nodes.length > 0 && parsed.nodes[0]?.children === null) {
      //old format
      initial = displayStateToGraph(parsed);
      saveGraphToLocalStorage(initial);
    }
  } catch {
    initial = new Graph([], []);
  }
  return initial;
};
