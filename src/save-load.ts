import { type Graph } from "./nodes-and-edges";

const STORAGE_KEY = "graph";
export const saveGraphToLocalStorage = (graph: Graph, storageKey: string = STORAGE_KEY) => {
  localStorage.setItem(storageKey, JSON.stringify(graph, null, 2));
};
export const loadGraphFromLocalStorage = (storageKey: string = STORAGE_KEY): Graph => {
  let initial: Graph;
  const empty = { nodes: [], edges: [] };
  try {
    const json = localStorage.getItem(storageKey);
    initial = json ? JSON.parse(json) : empty;
  } catch {
    initial = empty;
  }
  return initial;
};
