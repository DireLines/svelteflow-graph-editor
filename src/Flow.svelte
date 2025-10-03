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
  import { type DisplayState, edgeDefaults, type Graph, type NodeData, getNodesById } from "./nodes-and-edges";
  import CustomNode from "./CustomNode.svelte";
  import { saveGraphToLocalStorage, loadGraphFromLocalStorage } from "./save-load";
  import { addPositions, subPositions, getNodeRectFlowCoordinates, getBoundingRect } from "./math";
  import { getHighestNumericId, isNil } from "./util";
  const { deleteElements, screenToFlowPosition, getIntersectingNodes, updateNode } = useSvelteFlow();

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
  console.log("displayState", displayState);
  let nodes = $state.raw<Node[]>([...displayState.nodes]);
  let edges = $state.raw<Edge[]>([...displayState.edges]);

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

  const refreshDisplayState = async () => {
    await deleteElements(displayState);
    displayState = graph.getDisplayState(focusedNodeId);
    nodes = displayState.nodes;
    edges = displayState.edges;
  };

  const loadGraphFromFile = async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      graph.nodes = data.nodes;
      graph.edges = data.edges;
      nextNodeId = getHighestNumericId(graph.nodes) + 1;
      focusedNodeId = null;
      unsavedChanges = false;
      await refreshDisplayState();
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
  const getOffsetOfOrigin = (node) => ({
    x: node.measured.width * node.origin[0],
    y: node.measured.height * node.origin[1],
  });
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
    refreshDisplayState();
  };

  //stop dragging node
  const handleNodeDragStop: NodeTargetEventWithPointer = (event, defaultParentId: string | null = focusedNodeId) => {
    unsavedChanges = true;
    const { clientX, clientY } = event?.event;
    const thisNode = event.targetNode;
    const parent = getParentNode(clientX, clientY, thisNode.id);
    const oldParentId = thisNode.parentId;
    const newParentId = parent?.id ?? defaultParentId;
    if (parent.id === thisNode.id) {
      return;
    }
    //reparent on backend
    graph.reparent(oldParentId, newParentId, thisNode.id);
    if (parent) {
      const globalCoords = localToFlowPosition(thisNode.position, thisNode.parentId);
      const newPos = flowToLocalPosition(globalCoords, parent.id);
      graph.updateNode(thisNode.id, { position: newPos });
      updateNode(thisNode.id, { position: newPos });
    } else if (!isNil(thisNode.parentId)) {
      const globalCoords = localToFlowPosition(thisNode.position, thisNode.parentId);
      graph.updateNode(thisNode.id, { position: globalCoords });
      updateNode(thisNode.id, { position: globalCoords });
    }
    refreshDisplayState();
  };
  //right click on background
  const handlePaneContextMenu = ({ event }) => {
    unsavedChanges = true;
    // Prevent native context menu from showing
    event.preventDefault();

    const { clientX, clientY } = event;
    const id = getId();
    makeNode(id, clientX, clientY);
    refreshDisplayState();
  };
  //right click inside node
  const handleNodeContextMenu = ({ event }) => {
    unsavedChanges = true;
    // Prevent native context menu from showing
    event.preventDefault();

    const { clientX, clientY } = event;
    //make child node inside this node
    const id = getId();
    makeNode(id, clientX, clientY);
    refreshDisplayState();
  };
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
    <select bind:value={colorMode}>
      <option value="dark">dark mode</option>
      <option value="light">light mode</option>
      <option value="system">system</option>
    </select>
    <!--TODO filter by set of assignees-->
    <!--TODO node search bar-->
  </Panel>
</SvelteFlow>
