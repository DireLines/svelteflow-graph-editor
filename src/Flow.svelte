<script lang="ts">
  //TODO move things into module-level script when applicable
  import {
    SvelteFlow,
    useSvelteFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    type Node,
    type Edge,
    type ColorMode,
    type OnConnectEnd,
    type NodeTargetEventWithPointer,
    getIncomers,
  } from "@xyflow/svelte";

  import "@xyflow/svelte/dist/style.css";
  import CustomNode from "./CustomNode.svelte";

  import { globalFuncs } from "./App.svelte";

  import { nodeDefaults, edgeDefaults } from "./nodes-and-edges";
  import { addPositions, subPositions } from "./math";
  import { getBackgroundColor, getTextColor } from "./colors";
  const {
    screenToFlowPosition,
    // flowToScreenPosition,
    // isNodeIntersecting,
    getIntersectingNodes,
    // fitBounds,
    getNodesBounds,
    // getNode,
    updateNode,
    deleteElements,
    getNode,
    updateEdge,
  } = useSvelteFlow();
  const STORAGE_KEY = "graph";

  let showCompleted = $state(true);
  let showWorkable = $state(true);
  let showUpcoming = $state(true);

  // load existing or fall back
  let initial;
  const defaultValue = { nodes: [], edges: [] };
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    initial = json ? JSON.parse(json) : defaultValue;
  } catch {
    initial = defaultValue;
  }
  const nodeTypes = { custom: CustomNode };
  let nodes = $state.raw<Node[]>(initial.nodes);
  let edges = $state.raw<Edge[]>(initial.edges);

  let unsavedChanges = $state(false);

  const handleBeforeUnload = (event) => {
    if (!unsavedChanges) return;
    // tell the browser to prompt the user
    event.preventDefault();
    event.returnValue = "";
  };

  //set id to max of incoming node ids + 1
  let id = 0;
  //TODO:utils
  const containsOnlyDigits = (value) => {
    return /^-?\d+$/.test(value);
  };
  for (const n of nodes) {
    if (containsOnlyDigits(n.id)) {
      const parsed = parseInt(n.id);
      if (parsed > id) {
        id = parsed;
      }
    }
  }
  id++;
  const getId = () => `${id++}`;
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
  const getPositionOfOrigin = (node) => subPositions(node.position, getOffsetOfOrigin(node));
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
    const newNode: Node = {
      id,
      data: { label: `Task ${id}`, completed: false },
      position,
      parentId: parent?.id,
      ...nodeDefaults,
    };
    if (parent) {
      const nodesById = getNodesById(nodes);
      //recursively resize parents
      resizeNodeToEncapsulateChildren(parent.id, nodesById);
    }
    return newNode;
  };
  const makeEdge = (sourceId, targetId) => ({
    source: sourceId,
    target: targetId,
    id: `${sourceId}->${targetId}`,
    ...edgeDefaults,
  });
  let colorMode: ColorMode = $state("dark");
  const getNodesById = (nodes) => {
    const result = {};
    for (const node of nodes) {
      result[node.id] = node;
    }
    return result;
  };
  //localPosition in coordinates of node with id nodeId to global (flow) coordinates
  const localToFlowPosition = (localPosition, nodeId) => {
    const nodesById = getNodesById(nodes); //TODO precompute when nodes change
    const thisNode = nodesById[nodeId];
    if (!thisNode) {
      return localPosition;
    }
    if (thisNode.parentId === null || thisNode.parentId === undefined) {
      return addPositions(localPosition, getPositionOfOrigin(thisNode));
    }
    return localToFlowPosition(addPositions(localPosition, getPositionOfOrigin(thisNode)), thisNode.parentId);
  };
  //flowPosition in global (flow) coordinates to coordinates of node with id nodeId
  const flowToLocalPosition = (flowPosition, nodeId) => {
    const nodesById = getNodesById(nodes); //TODO precompute when nodes change
    const thisNode = nodesById[nodeId];
    if (!thisNode) {
      return flowPosition;
    }
    if (thisNode.parentId === null || thisNode.parentId === undefined) {
      return subPositions(flowPosition, getPositionOfOrigin(thisNode));
    }
    return flowToLocalPosition(subPositions(flowPosition, getPositionOfOrigin(thisNode)), thisNode.parentId);
  };
  const buildTree = (nodes) => {
    const nodeMap = new Map();
    const tree = [];

    // Initialize all nodes with a children array and store in a map
    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    // Assign children to their parent
    for (const node of nodes) {
      const currentNode = nodeMap.get(node.id);
      if (node.parentId == null) {
        tree.push(currentNode); // Root node
      } else {
        const parentNode = nodeMap.get(node.parentId);
        if (parentNode) {
          parentNode.children.push(currentNode);
        }
      }
    }

    return tree;
  };
  const preorderTraverse = (node) => {
    const thisNodeWithoutChildren = { ...node };
    delete thisNodeWithoutChildren.children;
    if (!node.children || node.children.length === 0) {
      return [thisNodeWithoutChildren];
    }
    const childrenTraversal = node.children.map((child) => preorderTraverse(child)).flat();
    return [thisNodeWithoutChildren, ...childrenTraversal];
  };
  const reorderParentsFirst = (nodes) => {
    const tree = buildTree(nodes);
    const root = { children: tree };
    return preorderTraverse(root).slice(1); //exclude root node
  };
  const findDiffInLocalPosition = (parentNode, newSize) => {
    const existingOffset = getOffsetOfOrigin(parentNode);
    const newOffset = {
      x: newSize.width * parentNode.origin[0],
      y: newSize.height * parentNode.origin[1],
    };
    return subPositions(newOffset, existingOffset);
  };
  const resizeNodeToEncapsulateChildren = (nodeId, nodesById) => {
    console.log("resizing", nodeId);
    const thisNode = nodesById[nodeId];
    const children = [];
    for (const otherId in nodesById) {
      const node = nodesById[otherId];
      if (node?.parentId === nodeId) {
        children.push(node);
      }
    }
    console.log(thisNode);
    const bounds = getNodesBounds(children); //this returns bounding rect as top left corner in global coords + width/height
    //want that
    // - children stay where they are globally
    // - size of parent node changes to encapsulate children and parent contents with some padding on all sides
    // - center of parent node moves to center of child bounds
    const boundsLocal = flowToLocalPosition(bounds, nodeId); //get xy in local coords
    const padding = 50;
    const newSize = { width: bounds.width + padding, height: bounds.height + padding };
    // const newParentCenterPos = {x:}
    console.log(newSize);
    //figure out diff in local position for children
    const positionDiff = findDiffInLocalPosition(thisNode, newSize);
    //reposition children for new offset
    for (const node of children) {
      const newPos = addPositions(node.position, positionDiff);
      updateNode(node.id, { position: newPos });
    }
    updateNode(thisNode.id, { width: newSize.width, height: newSize.height });
    //resize parent recursively
    if (thisNode.parentId !== null && thisNode.parentId !== undefined) {
      resizeNodeToEncapsulateChildren(thisNode.parentId, nodesById);
    }
  };
  const getEncapsulatingSize = (targetNodeId, nodes) => {
    const objectsToEncapsulate = [];
    for (const node of nodes) {
      if (node.parentId === targetNodeId) {
        objectsToEncapsulate.push(node);
      }
    }
    const bounds = getNodesBounds(objectsToEncapsulate);
    const padding = 50; //pixels
    return { width: bounds.width + padding, height: bounds.height + padding };
  };
  //stop dragging node
  const handleNodeDragStop: NodeTargetEventWithPointer = (event) => {
    unsavedChanges = true;
    const { clientX, clientY } = event?.event;
    const thisNode = event.targetNode;
    const parent = getParentNode(clientX, clientY, thisNode.id);
    const oldParentId = thisNode.parentId;
    const newParentId = parent?.id;
    if (parent && parent.id !== thisNode.id) {
      const globalCoords = localToFlowPosition(thisNode.position, thisNode.parentId);
      const newPos = flowToLocalPosition(globalCoords, parent.id);
      updateNode(thisNode.id, { parentId: parent.id, position: newPos });
    } else if (thisNode.parentId !== null && thisNode.parentId !== undefined) {
      const globalCoords = localToFlowPosition(thisNode.position, thisNode.parentId);
      updateNode(thisNode.id, { parentId: undefined, position: globalCoords });
    }
    const nodesById = getNodesById(nodes);
    if (newParentId !== null && newParentId !== undefined) {
      resizeNodeToEncapsulateChildren(newParentId, nodesById);
    }
    if (oldParentId !== null && oldParentId !== undefined) {
      resizeNodeToEncapsulateChildren(oldParentId, nodesById);
    }
    nodes = reorderParentsFirst(nodes);
  };
  //right click inside node
  const handleNodeContextMenu = ({ event, node }) => {
    unsavedChanges = true;
    // Prevent native context menu from showing
    event.preventDefault();

    const { clientX, clientY } = event;
    //make child node inside this node
    const id = getId();
    nodes = [...nodes, makeNode(id, clientX, clientY)];
    globalFuncs.restyleGraph();
  };
  //right click on background
  const handlePaneContextMenu = ({ event }) => {
    unsavedChanges = true;
    // Prevent native context menu from showing
    event.preventDefault();

    const { clientX, clientY } = event;
    const id = getId();
    nodes = [...nodes, makeNode(id, clientX, clientY)];
    globalFuncs.restyleGraph();
  };
  //stop dragging edge
  const handleConnectEnd: OnConnectEnd = (event, connectionState) => {
    unsavedChanges = true;
    if (connectionState.isValid) {
      globalFuncs.restyleGraph();
      return;
    }
    const draggingFromSource = connectionState.fromHandle?.type === "source";

    const sourceNodeId = connectionState.fromNode?.id ?? "1";
    const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;

    const id = getId();
    const newNode: Node = makeNode(id, clientX, clientY);
    const newEdge = draggingFromSource ? makeEdge(sourceNodeId, id) : makeEdge(id, sourceNodeId);
    nodes = [...nodes, newNode];
    edges = [...edges, newEdge];
    globalFuncs.restyleGraph();
  };

  let fileInput; // for “Load” dialog

  // --- LOADING (open file) ---
  const triggerLoad = () => {
    if (nodes.length > 0 || edges.length > 0) {
      const discard = window.confirm("You have unsaved changes - importing from a file will discard them. Continue?");
      if (!discard) {
        return;
      }
    }
    fileInput.click();
  };

  const handleFileChange = async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await deleteElements({ nodes, edges });
      nodes = data.nodes;
      edges = data.edges;
      //set id to max of incoming node ids + 1
      for (const n of nodes) {
        n.hidden = false;
        if (containsOnlyDigits(n.id)) {
          const parsed = parseInt(n.id);
          if (parsed > id) {
            id = parsed;
          }
        }
      }
      id++;
      unsavedChanges = false;
    } catch (err) {
      console.error("Failed to load/parse JSON", err);
    } finally {
      // reset so the same file can be re-selected later if desired
      event.target.value = "";
    }
  };

  // --- SAVING (download file) ---
  const triggerSave = (stateObj) => {
    const json = JSON.stringify(stateObj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.download = "graph-project.json"; //TODO: use project name for filename
    a.href = url;
    document.body.appendChild(a);
    a.click();

    // cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    unsavedChanges = false;
  };

  const clearGraph = () => {
    if (nodes.length > 0 || edges.length > 0) {
      const discard = window.confirm("Clear entire graph?");
      if (!discard) {
        return;
      }
    }
    nodes = [];
    edges = [];
    id = 1;
    unsavedChanges = false;
  };

  function saveGraph() {
    //TODO: more defined serializeNode function to clean node for serialization
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nodes: nodes.map((n) => ({ ...n, hidden: false })),
        edges: edges.map((e) => ({ ...e, hidden: false })),
      })
    );
    unsavedChanges = false;
  }

  //TODO: this should handle all node display changes in response to changes to the graph
  //(e.g. progress indicators) and get called everywhere appropriate
  globalFuncs.restyleGraph = () => {
    for (const node of nodes) {
      //TODO: if this node is a child, handle status of parent(s)
      //if parent is not workable, this should be displayed as not workable
      //if parent is completed, this should be displayed as completed
      let workable = true;
      const incomingNodes = getIncomers(node, nodes, edges);
      for (const incomingNode of incomingNodes) {
        if (!incomingNode.data.completed) {
          workable = false;
        }
      }
      const shouldHide = !(node.data.completed ? showCompleted : workable ? showWorkable : showUpcoming);
      updateNode(node.id, { hidden: shouldHide }); //TODO: set border-color when workable, otherwise do not override
    }
    for (const edge of edges) {
      //if both endpoints of edge should be visible, so should edge, otherwise it should be hidden
      const sourceHidden = getNode(edge.source)?.hidden;
      const targetHidden = getNode(edge.target)?.hidden;
      const shouldHide = sourceHidden || targetHidden;
      const shouldGrey = getNode(edge.target)?.data.completed; //TODO: set edge opacity to 30% if shouldGrey, else 100%
      updateEdge(edge.id, { hidden: shouldHide ?? undefined });
    }
  };
  globalFuncs.restyleGraph();

  $effect(() => {
    saveGraph();
  });
</script>

<!-- hook into the window event declaratively -->
<svelte:window on:beforeunload={handleBeforeUnload} />

<!-- Hidden file input for “Load” -->
<input type="file" accept="application/json" bind:this={fileInput} onchange={handleFileChange} style="display: none;" />

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
  minZoom={0.2}
  maxZoom={6}
>
  <Background />
  <Controls />
  <MiniMap />
  <Panel style="display:flex; flex-direction: column; gap:2px;">
    <button onclick={() => triggerSave({ nodes, edges })}> 💾 Export </button>
    <button onclick={triggerLoad}> 📂 Import </button>
    <button onclick={clearGraph}> 🗑️ Clear </button>
    <select bind:value={colorMode}>
      <option value="dark">dark mode</option>
      <option value="light">light mode</option>
      <option value="system">system</option>
    </select>
    <div style="color:#f8f8f8">Show</div>
    <div style="color:#f8f8f8">
      <input type="checkbox" bind:checked={showCompleted as boolean} onchange={globalFuncs.restyleGraph} />past
    </div>
    <div style="color:#f8f8f8">
      <input type="checkbox" bind:checked={showWorkable as boolean} onchange={globalFuncs.restyleGraph} />present
    </div>
    <div style="color:#f8f8f8">
      <input type="checkbox" bind:checked={showUpcoming as boolean} onchange={globalFuncs.restyleGraph} />future
    </div>
    <!--TODO filter by set of assignees-->
    <!--TODO node search bar-->
  </Panel>
</SvelteFlow>
