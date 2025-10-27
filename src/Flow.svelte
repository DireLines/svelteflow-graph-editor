<script lang="ts">
  import {
    SvelteFlow,
    useSvelteFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    type ColorMode,
    type OnConnectEnd,
    type NodeTargetEventWithPointer,
    type Node,
    type Edge,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import {
    edgeDefaults,
    Graph,
    type NodeData,
    getNodesById,
    displayStateToGraph,
    addDefaultsToEdge,
  } from "./nodes-and-edges";
  import CustomNode from "./CustomNode.svelte";
  import { saveGraphToLocalStorage, loadGraphFromLocalStorage } from "./save-load";
  import { addPositions, subPositions, getBoundingRect, getNodeRectLocalCoordinates } from "./math";
  import { getNodeLabelElement } from "./nodeElements";
  import { getHighestNumericId, isNil } from "./util";
  import { globals } from "./App.svelte";
  const { deleteElements, screenToFlowPosition, getIntersectingNodes, updateNode, getZoom, getNodesBounds, fitView } =
    useSvelteFlow();

  let colorMode: ColorMode = $state("dark");
  const nodeTypes = { custom: CustomNode };

  //backend graph - source of truth
  let graph = $state.raw<Graph>(loadGraphFromLocalStorage());
  let focusedNodeId = $state.raw<string | null>(null);
  //number used and incremented when new node generated
  let nextNodeId: number = getHighestNumericId(graph.nodes) + 1;
  const getId = () => `${nextNodeId++}`;

  //frontend graph - what is displayed by svelteflow
  let displayState = graph.getDisplayState(focusedNodeId);
  console.log("graph", graph);
  console.log("displayState", displayState);

  //NOTE: do not directly modify this state. it gets refreshed in the refresh() function based on the value of graph
  let nodes = $state.raw<Node[]>(displayState.nodes);
  let edges = $state.raw<Edge[]>(displayState.edges);
  let title = $state.raw<string>(displayState.title);
  let subtitle = $state.raw<string>(displayState.description);

  let fileInput: HTMLInputElement; // for “Load” dialog

  // enter file selection for load
  const triggerLoad = () => {
    if (graph.nodes.length > 0 || graph.edges.length > 0) {
      const discard = window.confirm("You have unsaved changes - importing from a file will discard them. Continue?");
      if (!discard) {
        return;
      }
    }
    fileInput.click();
  };

  //track unsaved changes
  let unsavedChanges = $state(false);
  // tell the browser to prompt the user on unsaved changes
  const warnUnsavedChanges = (event) => {
    if (!unsavedChanges) return;
    event.preventDefault();
    event.returnValue = "";
  };

  //save graph to local storage and refresh display
  const refresh = async () => {
    console.log("refresh");
    //TODO update project name component with focused node
    //TODO why is top-level node still being displayed?
    saveGraphToLocalStorage(graph);
    unsavedChanges = false;
    const selectedNodes = {};
    for (const node of nodes) {
      if (node.selected) {
        selectedNodes[node.id] = true;
      }
    }
    await deleteElements(displayState);
    displayState = graph.getDisplayState(focusedNodeId);
    console.log(graph);
    console.log("displayState", displayState);
    nodes = displayState.nodes;
    edges = displayState.edges;
    title = displayState.title;
    subtitle = displayState.description;
    for (const selectedNodeId in selectedNodes) {
      updateNode(selectedNodeId, { selected: true });
    }
  };

  const loadGraphFromFile = async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    try {
      const text = await file.text();
      let data = JSON.parse(text);
      if (data.nodes.length > 0 && isNil(data.nodes[0]?.children)) {
        //old format
        data = displayStateToGraph(data);
      }
      graph.nodes = data.nodes;
      graph.edges = data.edges;
      nextNodeId = getHighestNumericId(graph.nodes) + 1;
      focusedNodeId = null;
      unsavedChanges = false;
      await refresh().then(() => fitView());
    } catch (err) {
      console.error("Failed to load/parse JSON", err);
    } finally {
      // reset so the same file can be re-selected later if desired
      event.target.value = "";
    }
  };

  //TODO: when calling, use project name for filename
  const saveObjToFile = (stateObj: any, filename: string = "graph-project.json") => {
    const json = JSON.stringify(stateObj);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement("a");

    tempLink.download = filename;
    tempLink.href = url;
    document.body.appendChild(tempLink);
    tempLink.click();

    // cleanup
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(url);
    unsavedChanges = false;
  };
  //TODO: default to focusedNodeId rather than undefined
  const getParentNode = (clientX, clientY, ignoreNodeId = null) => {
    // project the screen coordinates to pane coordinates
    const position = screenToFlowPosition({
      x: clientX,
      y: clientY,
    });
    //parent = find lowest node containing selected position in pane coords
    const epsilon = 0.00001;
    const posRect = {
      ...position,
      width: epsilon,
      height: epsilon,
    };
    const nodesHitByCursor = getIntersectingNodes(posRect);
    let parent = focusedNodeId;
    //lowest node has no children among these nodes
    //TODO: O(n^2) cringe
    for (const node of nodesHitByCursor) {
      if (node.id === ignoreNodeId) {
        continue;
      }
      let hasChild = false;
      for (const other of nodesHitByCursor) {
        if (other.id === ignoreNodeId) {
          continue;
        }
        if (other?.parentId && other?.parentId === node.id) {
          //node has a child
          hasChild = true;
          break;
        }
      }
      if (!hasChild) {
        parent = node;
        break;
      }
    }
    return parent;
  };
  //flowPosition in global (flow) coordinates to coordinates of node with id nodeId
  const flowToLocalPosition = (flowPosition, nodeId) => {
    const nodesById = getNodesById(displayState.nodes); //TODO precompute when nodes change
    const thisNode = nodesById[nodeId];
    if (!thisNode) {
      return flowPosition;
    }
    if (thisNode.parentId === null || thisNode.parentId === undefined) {
      return subPositions(flowPosition, thisNode.position);
    }
    return flowToLocalPosition(subPositions(flowPosition, thisNode.position), thisNode.parentId);
  };
  //localPosition in coordinates of node with id nodeId to global (flow) coordinates
  const localToFlowPosition = (localPosition, nodeId) => {
    const nodesById = getNodesById(displayState.nodes); //TODO precompute when nodes change
    const thisNode = nodesById[nodeId];
    if (!thisNode) {
      return localPosition;
    }
    if (thisNode.parentId === null || thisNode.parentId === undefined) {
      return addPositions(localPosition, thisNode.position);
    }
    return localToFlowPosition(addPositions(localPosition, thisNode.position), thisNode.parentId);
  };
  const makeNode = (id, clientX, clientY) => {
    let parent = getParentNode(clientX, clientY);
    // project the screen coordinates to pane coordinates
    let position = screenToFlowPosition({
      x: clientX,
      y: clientY,
    });
    if (parent) {
      //adjust position to be relative to parent
      position = flowToLocalPosition(position, parent.id);
    }
    //make node as child of parent
    const newNode: NodeData = {
      id,
      children: [],
      label: `Task ${id}`,
      completed: false,
      lastManualResize: null,
      size: { width: 72, height: 36 },
      backgroundColor: "#111",
      position,
    };
    graph.addNode(newNode, parent?.id);
    if (parent) {
      resizeNodeToEncapsulateChildren(parent.id, getNodesById(nodes));
    }
    return newNode;
  };

  const makeEdge = (sourceId, targetId) => ({
    source: sourceId,
    target: targetId,
    id: `${sourceId}->${targetId}`,
  });
  const isValidConnection = (_) => false; //if we say true, it will create an edge outside of handleConnectEnd
  //stop dragging edge
  const handleConnectEnd: OnConnectEnd = (event, connectionState) => {
    console.log("handleConnectEnd");
    unsavedChanges = true;
    const draggingFromSource = connectionState.fromHandle?.type === "source";

    const sourceNodeId = connectionState.fromNode?.id ?? "1";
    const targetNodeId = connectionState.toNode?.id;
    const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;

    const id = getId();
    let startId = sourceNodeId;
    let endId = targetNodeId;
    if (isNil(targetNodeId)) {
      makeNode(id, clientX, clientY);
      endId = id;
    }
    if (!draggingFromSource) {
      //swap
      const temp = startId;
      startId = endId;
      endId = temp;
    }
    const newEdge = makeEdge(startId, endId);
    graph.addEdge(newEdge);
    displayState.edges = [...displayState.edges, addDefaultsToEdge(newEdge)];
    refresh();
  };

  //stop dragging node
  const handleNodeDragStop: NodeTargetEventWithPointer = (event, defaultParentId: string | null = focusedNodeId) => {
    console.log("handleNodeDragStop");
    unsavedChanges = true;
    const { clientX, clientY } = event?.event;
    const thisNode = event.targetNode;
    const parent = getParentNode(clientX, clientY, thisNode.id);
    const oldParentId = thisNode.parentId;
    const newParentId = parent?.id ?? defaultParentId;
    if (parent?.id === thisNode.id) {
      return;
    }
    //reparent on backend
    let newPos = localToFlowPosition(thisNode.position, thisNode.parentId);
    if (parent) {
      newPos = flowToLocalPosition(newPos, parent.id);
    }
    updateNode(thisNode.id, { position: newPos, parentId: newParentId });
    graph.reparent(oldParentId, newParentId, thisNode.id);
    graph.refreshParentIds();
    graph.updateNode(thisNode.id, { position: newPos });
    const resizedNodesById = {};
    resizedNodesById[thisNode.id] = {
      ...newPos,
      width: thisNode.measured?.width ?? thisNode.width,
      height: thisNode.measured?.height ?? thisNode.height,
    };
    const nodesById = getNodesById(nodes);
    if (!isNil(oldParentId)) {
      resizeNodeToEncapsulateChildren(oldParentId, nodesById, resizedNodesById);
    }
    if (!isNil(newParentId) && newParentId !== oldParentId) {
      resizeNodeToEncapsulateChildren(newParentId, nodesById, resizedNodesById);
    }
    refresh();
  };
  //right click on background
  const handlePaneContextMenu = ({ event }) => {
    console.log("handlePaneContextMenu");
    unsavedChanges = true;
    // Prevent native context menu from showing
    event.preventDefault();

    const { clientX, clientY } = event;
    const id = getId();
    makeNode(id, clientX, clientY);
    refresh();
  };
  //right click inside node
  const handleNodeContextMenu = ({ event }) => {
    console.log("handleNodeContextMenu");
    unsavedChanges = true;
    // Prevent native context menu from showing
    event.preventDefault();

    const { clientX, clientY } = event;
    //make child node inside this node
    const id = getId();
    makeNode(id, clientX, clientY);
    refresh();
  };

  const clearGraph = () => {
    if (graph.nodes.length > 0 || graph.edges.length > 0) {
      const discard = window.confirm("Clear entire graph?");
      if (!discard) {
        return;
      }
    }
    graph = new Graph([], []);
    nextNodeId = 1;
    globals.graph = graph;
    refresh();
  };

  const handleDelete = async ({ nodes: deletedNodes, edges: deletedEdges }) => {
    for (const node of deletedNodes) {
      graph.deleteNode(node.id);
    }
    for (const edge of deletedEdges) {
      graph.deleteEdge(edge.id);
    }
    refresh();
    return true;
  };
  const getNodeLabelSize = (nodeId: string) => {
    const el = getNodeLabelElement(nodeId);
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const zoom = getZoom();
    return {
      width: Math.round(rect.width / zoom),
      height: Math.round(rect.height / zoom),
    };
  };

  //want that
  // - children stay where they are globally
  // - size of parent node changes to encapsulate children and parent contents with some padding on all sides
  // - center of parent node moves to center of (children and parent contents)
  //resizedNodesById caches nodes which have been resized by this resize operation and their new sizes
  //this is because that info doesn't propagate immediately in svelteflow
  const resizeNodeToEncapsulateChildren = (nodeId, nodesById, resizedNodesById = {}) => {
    console.log("resizing", nodeId, { ...resizedNodesById });
    //gather data needed
    //1. current size of parent's label
    const labelSize = getNodeLabelSize(nodeId);
    //2. current offset of parent
    const thisNode = nodesById[nodeId];
    //3. list of child nodes
    const children = [];
    for (const otherId in nodesById) {
      const node = nodesById[otherId];
      if (node?.parentId === nodeId) {
        children.push(node);
      }
    }
    //rects of child nodes in flow coordinates
    const childRectsFlowCoordinates = children
      .map((n) => getNodeRectLocalCoordinates(n, resizedNodesById))
      .map((r) => ({ ...r, ...localToFlowPosition(r, nodeId) }));
    if (nodeId === "1") {
      console.log("childRectsFlowCoordinates", childRectsFlowCoordinates);
    }
    //4. padding
    const padding = 20; // padding on all sides (radius, not diameter)
    //TODO: padding should be proportional to node size

    //determine new size of this node
    //bounding rectangle of children (flow coordinates)
    const childBounds = getBoundingRect(childRectsFlowCoordinates);

    //labelSize will be different after resizing to fit children - estimate new size of label
    //label contains same text, so takes up roughly the same area
    //TODO if label font size is proportional to node size, also need to account for that
    const widthRatio = labelSize.width / childBounds.width;
    const vertPad = 10;
    const heightOfOneLine = 14;
    let resultLabelHeight = heightOfOneLine;
    if (childBounds.width > 0) {
      resultLabelHeight = Math.max(heightOfOneLine, labelSize.height * widthRatio);
    }
    const newLabelSize = {
      width: childBounds.width,
      height: resultLabelHeight,
    };

    //determine new xy and size of parent minus padding (flow coordinates)
    let contentBounds = {
      x: childBounds.x,
      y: childBounds.y - newLabelSize.height - vertPad,
      width: childBounds.width,
      height: childBounds.height + newLabelSize.height + vertPad,
    };
    if (children.length === 0) {
      contentBounds = {
        x: thisNode.position.x + thisNode.measured.width / 2,
        y: thisNode.position.y + thisNode.measured.height / 2,
        width: newLabelSize.width,
        height: childBounds.height + newLabelSize.height + vertPad,
      };
    }

    const svelteflowBounds = getNodesBounds(children); //this returns bounding rect as top left corner in global coords + width/height
    console.log("bounds (reported from svelteflow)", svelteflowBounds);
    console.log("childBounds (estimated, should match svelteflow)", childBounds);
    console.log("total contentBounds (children + node label)", contentBounds);
    const newSize = { width: contentBounds.width + 2 * padding, height: contentBounds.height + 2 * padding };
    console.log("new size", newSize);
    console.log("labelSize", labelSize);
    console.log("newLabelSize", newLabelSize);
    const backendNode = graph.getNode(nodeId);
    {
      //don't resize smaller than manual resize
      if (backendNode) {
        const lastManualResize = backendNode.lastManualResize;
        if (lastManualResize) {
          newSize.width = Math.max(newSize.width, lastManualResize.width);
          newSize.height = Math.max(newSize.height, lastManualResize.height);
        }
      }
    }
    //figure out diff in position for parent
    const newParentPos = subPositions({ x: contentBounds.x, y: contentBounds.y }, { x: padding, y: padding });
    //need to set this node's position in coords relative to its parent
    const newParentPosLocal = flowToLocalPosition(newParentPos, thisNode?.parentId);
    console.log("parent's position has changed from", thisNode.position, "to", newParentPosLocal);
    const parentPosDiff = subPositions(newParentPosLocal, thisNode.position);
    console.log("parent has moved by ", parentPosDiff);
    //figure out diff in local position for children
    updateNode(thisNode.id, { ...newSize, position: newParentPosLocal });
    graph.updateNode(thisNode.id, { size: newSize, position: newParentPosLocal });
    resizedNodesById[thisNode.id] = { ...newParentPosLocal, ...newSize };
    //reposition children for new offset
    for (const node of children) {
      const newPos = subPositions(node.position, parentPosDiff);
      updateNode(node.id, { position: newPos });
      graph.updateNode(node.id, { position: newPos });
    }

    //resize parent recursively
    if (!isNil(backendNode.parentId)) {
      resizeNodeToEncapsulateChildren(backendNode.parentId, nodesById, resizedNodesById);
    }
  };
  const setFocusedNode = (nodeId: string) => {
    //TODO: handle setting to null to go back to root
    focusedNodeId = nodeId;
    refresh().then(() => {
      fitView();
    });
  };
  globals.refresh = refresh;
  globals.graph = graph;
  globals.setFocusedNode = setFocusedNode;
  //in case link gets broken
  $effect(() => {
    globals.refresh = refresh;
    globals.graph = graph;
    globals.setFocusedNode = setFocusedNode;
  });
</script>

<!-- hook into the window event declaratively -->
<svelte:window on:beforeunload={warnUnsavedChanges} />

<!-- Hidden file input for “Load” -->
<input
  type="file"
  accept="application/json"
  bind:this={fileInput}
  onchange={loadGraphFromFile}
  style="display: none;"
/>

<SvelteFlow
  bind:nodes
  bind:edges
  {colorMode}
  {nodeTypes}
  defaultEdgeOptions={edgeDefaults}
  fitView
  onconnectend={handleConnectEnd}
  onnodedragstop={handleNodeDragStop}
  onpanecontextmenu={handlePaneContextMenu}
  onnodecontextmenu={handleNodeContextMenu}
  ondelete={handleDelete}
  {isValidConnection}
  minZoom={0.2}
  maxZoom={6}
>
  <Panel position="top-center" class="titlebar" aria-hidden="true">
    <h1 class="title">{title}</h1>
  </Panel>
  <Background />
  <Controls />
  <MiniMap />
  <Panel style="display:flex; flex-direction: column; gap:2px;">
    <button onclick={() => saveObjToFile(graph)}> 💾 Export </button>
    <button onclick={triggerLoad}> 📂 Import </button>
    <button onclick={clearGraph}> Clear </button>
    <select bind:value={colorMode}>
      <option value="dark">dark mode</option>
      <option value="light">light mode</option>
      <option value="system">system</option>
    </select>
    <!--TODO filter by set of assignees-->
    <!--TODO node search bar-->
  </Panel>
</SvelteFlow>

<style>
  .flow-root {
    width: 100%;
    height: 100vh; /* or your own container size */
  }

  /* Make the whole panel non-interactive so you can drag/pan beneath it */
  .titlebar {
    pointer-events: none;
    padding-top: 0.5rem; /* a little breathing room from the top edge */
  }

  .title {
    pointer-events: auto; /* flip this to 'auto' only if you add buttons/links inside */
    margin: 0;
    line-height: 1;
    padding: 0.25rem 0.75rem;
    font-weight: 800;
    font-size: clamp(20px, 4vw, 80px);
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(4px); /* tasteful readability chip; remove if you prefer */
    border-radius: 10%;
  }

  @media print {
    .titlebar {
      display: none;
    }
  }
</style>
