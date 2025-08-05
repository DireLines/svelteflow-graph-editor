const nodeLabelElements = new Map<string, HTMLElement>();

export function registerNodeLabelElement(nodeId: string, el: HTMLElement) {
  nodeLabelElements.set(nodeId, el);
}

export function unregisterNodeLabelElement(nodeId: string) {
  nodeLabelElements.delete(nodeId);
}

export function getNodeLabelElement(nodeId: string): HTMLElement | undefined {
  return nodeLabelElements.get(nodeId);
}
