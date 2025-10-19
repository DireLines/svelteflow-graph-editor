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

  import { edgeDefaults, Graph, type NodeData, getNodesById, displayStateToGraph } from "./nodes-and-edges";
  import CustomNode from "./CustomNode.svelte";
  import { saveGraphToLocalStorage, loadGraphFromLocalStorage } from "./save-load";
  import { addPositions, subPositions, getBoundingRect, getNodeRectFlowCoordinates } from "./math";
  import { getNodeLabelElement } from "./nodeElements";
  import { getHighestNumericId, isNil } from "./util";
  import { globals } from "./App.svelte";
  const { deleteElements, screenToFlowPosition, getIntersectingNodes, updateNode, getZoom, getNodesBounds } =
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
  let nodes = $state.raw<Node[]>(displayState.nodes);
  let edges = $state.raw<Edge[]>(displayState.edges);

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
      await refresh();
    } catch (err) {
      console.error("Failed to load/parse JSON", err);
    } finally {
      // reset so the same file can be re-selected later if desired
      event.target.value = "";
    }
  };

  //TODO: when calling, use project name for filename
  const saveObjToFile = (stateObj: any, filename: string = "graph-project.json") => {
    const json = JSON.stringify(stateObj, null, 2);
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
    let parent = undefined;
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
  const getOffsetOfOrigin = (node) => {
    console.log("getOffsetOfOrigin", node);
    return {
      x: node.measured.width * node.origin[0],
      y: node.measured.height * node.origin[1],
    };
  };
  //flowPosition in global (flow) coordinates to coordinates of node with id nodeId
  const flowToLocalPosition = (flowPosition, nodeId) => {
    const getPositionOfOrigin = (node) => subPositions(node.position, getOffsetOfOrigin(node));
    const nodesById = getNodesById(displayState.nodes); //TODO precompute when nodes change
    const thisNode = nodesById[nodeId];
    if (!thisNode) {
      return flowPosition;
    }
    if (thisNode.parentId === null || thisNode.parentId === undefined) {
      return subPositions(flowPosition, getPositionOfOrigin(thisNode));
    }
    return flowToLocalPosition(subPositions(flowPosition, getPositionOfOrigin(thisNode)), thisNode.parentId);
  };
  const getPositionOfOrigin = (node) => subPositions(node.position, getOffsetOfOrigin(node));
  //localPosition in coordinates of node with id nodeId to global (flow) coordinates
  const localToFlowPosition = (localPosition, nodeId) => {
    const nodesById = getNodesById(displayState.nodes); //TODO precompute when nodes change
    const thisNode = nodesById[nodeId];
    if (!thisNode) {
      return localPosition;
    }
    if (thisNode.parentId === null || thisNode.parentId === undefined) {
      return addPositions(localPosition, getPositionOfOrigin(thisNode));
    }
    return localToFlowPosition(addPositions(localPosition, getPositionOfOrigin(thisNode)), thisNode.parentId);
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
      size: { x: 50, y: 50 },
      manuallyResized: false,
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
    ...edgeDefaults,
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
    let newEdge;
    if (isNil(targetNodeId)) {
      makeNode(id, clientX, clientY);
      newEdge = draggingFromSource ? makeEdge(sourceNodeId, id) : makeEdge(id, sourceNodeId);
    } else {
      newEdge = makeEdge(sourceNodeId, targetNodeId);
    }
    graph.addEdge(newEdge);
    displayState.edges = [...displayState.edges, newEdge];
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
    graph.updateNode(thisNode.id, { position: newPos });
    const nodesById = getNodesById(nodes);
    if (!isNil(oldParentId)) {
      resizeNodeToEncapsulateChildren(oldParentId, nodesById);
    }
    if (!isNil(newParentId)) {
      resizeNodeToEncapsulateChildren(newParentId, nodesById);
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

  const handleDelete = async ({ nodes: deletedNodes }) => {
    for (const node of deletedNodes) {
      graph.deleteNode(node.id);
    }
    refresh();
    return true;
  };
  const findDiffInLocalPosition = (parentNode, newSize) => {
    const existingOffset = getOffsetOfOrigin(parentNode);
    const newOffset = {
      x: newSize.width * parentNode.origin[0],
      y: newSize.height * parentNode.origin[1],
    };
    return subPositions(newOffset, existingOffset);
  };
  const getNodeLabelSize = (nodeId: string) => {
    const el = getNodeLabelElement(nodeId);
    if (!el) return undefined;
    console.log("el exists");
    const rect = el.getBoundingClientRect();
    console.log("rect", rect);
    const zoom = getZoom();
    console.log("zoom", zoom);
    return {
      width: Math.round(rect.width / zoom),
      height: Math.round(rect.height / zoom),
    };
  };
  //resizedNodesById caches nodes which have been resized by this resize operation and their new sizes
  //this is because that info doesn't propagate immediately in svelteflow
  const resizeNodeToEncapsulateChildren = (nodeId, nodesById, resizedNodesById = {}) => {
    console.log("resizing", nodeId);
    const thisNode = nodesById[nodeId];
    const children = [];
    for (const otherId in nodesById) {
      const node = nodesById[otherId];
      if (node?.parentId === nodeId) {
        children.push(node);
      }
    }
    const padding = 40; // padding on all sides
    const contentSize = getNodeLabelSize(nodeId);
    if (children.length > 0) {
      console.log("i have children");
      contentSize.height += 10; //vertical pad before child nodes
    }
    console.log(contentSize);
    const childBounds = getBoundingRect(children.map((n) => getNodeRectFlowCoordinates(n, resizedNodesById)));
    const contentPos = localToFlowPosition(childBounds, nodeId);
    const contentBounds = {
      x: contentPos.x,
      y: contentPos.y - contentSize.height,
      width: Math.max(contentSize.width, childBounds.width),
      height: contentSize.height + childBounds.height,
    };
    const bounds = getNodesBounds(children); //this returns bounding rect as top left corner in global coords + width/height
    console.log("contentBounds", contentBounds);
    console.log("childBounds", childBounds);
    console.log("bounds", bounds);
    //want that
    // - children stay where they are globally
    // - size of parent node changes to encapsulate children and parent contents with some padding on all sides
    // - center of parent node moves to center of (children and parent contents)
    const boundsLocal = flowToLocalPosition(bounds, nodeId); //get xy in local coords
    const newSize = { width: contentBounds.width + padding, height: contentBounds.height + padding };
    // const newParentCenterPos = {x:}
    console.log(newSize);
    //figure out diff in local position for children
    const positionDiff = findDiffInLocalPosition(thisNode, newSize);
    //reposition children for new offset
    for (const node of children) {
      const newPos = addPositions(node.position, positionDiff);
      updateNode(node.id, { position: newPos });
      graph.updateNode(node.id, { position: newPos });
    }
    updateNode(thisNode.id, { width: newSize.width, height: newSize.height });
    graph.updateNode(thisNode.id, { size: { x: newSize.width, y: newSize.height } });
    //resize parent recursively
    if (!isNil(thisNode.parentId)) {
      resizeNodeToEncapsulateChildren(thisNode.parentId, nodesById, resizedNodesById);
    }
  };
  const setFocusedNode = (nodeId: string) => {
    focusedNodeId = nodeId;
    refresh();
  };
  globals.refresh = refresh;
  globals.graph = graph;
  globals.setFocusedNode = setFocusedNode;
  //in case link gets broken
  $effect(() => {
    globals.graph = graph;
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
