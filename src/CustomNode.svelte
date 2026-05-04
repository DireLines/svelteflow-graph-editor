<script lang="ts">
  import {
    type NodeProps,
    Handle,
    Position,
    useNodeConnections,
    useNodesData,
    useSvelteFlow,
    useViewport,
    NodeResizeControl,
  } from "@xyflow/svelte";
  import { onMount, onDestroy } from "svelte";
  import { globals } from "./App.svelte";
  import { registerNodeLabelElement, unregisterNodeLabelElement } from "./nodeElements";
  import {
    MIN_FONT_SIZE,
    FONT_SCALE,
    MIN_BORDER_WIDTH,
    BORDER_SCALE,
    MIN_BORDER_RADIUS,
    BORDER_RADIUS_SCALE,
    MIN_HANDLE_SIZE,
    HANDLE_SCALE,
  } from "./nodes-and-edges";
  let { isConnectable, id, data, parentId, width }: NodeProps = $props();
  const fontSize = $derived(Math.max(MIN_FONT_SIZE, width ? width * FONT_SCALE : MIN_FONT_SIZE));
  const { updateNodeData } = useSvelteFlow();
  const borderWidth = $derived(Math.max(MIN_BORDER_WIDTH, width ? width * BORDER_SCALE : MIN_BORDER_WIDTH));
  const borderRadius = $derived(Math.max(MIN_BORDER_RADIUS, width ? width * BORDER_RADIUS_SCALE : MIN_BORDER_RADIUS));
  const handleSize = $derived(Math.max(MIN_HANDLE_SIZE, width ? width * HANDLE_SCALE : MIN_HANDLE_SIZE));
  const viewport = useViewport();
  const zoom = $derived(viewport.current.zoom);
  const MIN_PANEL_WORLD_SCALE = 1; // increase to keep panel larger when zoomed in
  const panelScale = $derived(Math.max(MIN_PANEL_WORLD_SCALE, 1 / zoom));

  let displayedContent: HTMLElement;
  onMount(() => {
    registerNodeLabelElement(id, displayedContent);
  });
  onDestroy(() => {
    unregisterNodeLabelElement(id);
  });

  $effect(() => {
    const nodeEl = displayedContent?.closest(".svelte-flow__node") as HTMLElement | null;
    if (nodeEl) {
      nodeEl.style.borderWidth = `${borderWidth}px`;
      nodeEl.style.borderRadius = `${borderRadius}px`;
    }
  });

  let editable: HTMLElement;
  let completed = $state(data.completed);
  let inProgress = $state(data.inProgress ?? false);

  const getOpacity = () => (globals.graph.isCompletedOrParentCompleted(id) ? "opacity: 30%" : "opacity: 100%");
  // Whenever the user types, update `text` and let parent know
  const handleLabelBlur = () => {
    data.label = editable.innerText;
    globals.graph.updateNode(id, { label: data.label });
    updateNodeData(id, { label: data.label });
    globals.resizeNodeToEncapsulateChildren(parentId, {});
    globals.refresh();
  };
  // Whenever the user types, resize the box
  const handleLabelInput = () => {
    data.label = editable.innerText;
    // globals.resizeNodeToEncapsulateChildren(parentId, {});
  };

  const setTaskState = (newCompleted: boolean, newInProgress: boolean) => {
    completed = newCompleted;
    inProgress = newInProgress;
    globals.graph.updateNode(id, { completed: newCompleted, inProgress: newInProgress });
    updateNodeData(id, { completed: newCompleted, inProgress: newInProgress });
    globals.refresh();
  };

  const handleResize = (_, newDims) => {
    const dims = { width: newDims.width, height: newDims.height };
    globals.graph.updateNode(id, { lastManualResize: dims, size: dims });
    globals.resizeNodeToEncapsulateChildren(parentId, {});
  };

  // Optional: keep caret at end when programmatically updating
  onMount(() => {
    editable.addEventListener("focus", () => {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  });
  //used for giving input edit events priority over node drag events
  const stopPropagation = (e: Event) => {
    // if (editing) {
    e.stopPropagation();
    // }
  };
  const handleLabelKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      editable.blur();
    }
  };
</script>

<div class="control-panel" style="transform: translateX(-50%) translateY(-100%) scale({panelScale}); top: 0;">
  <button
    class="state-btn"
    class:active={!(completed || inProgress)}
    title="mark as to-do"
    onclick={() => setTaskState(false, false)}>○</button
  >
  <button
    class="state-btn state-btn--progress"
    class:active={inProgress}
    title="mark as in progress"
    onclick={() => setTaskState(false, true)}>→</button
  >
  <button
    class="state-btn state-btn--done"
    class:active={completed}
    title="mark as done"
    onclick={() => setTaskState(true, false)}>✓</button
  >
  <div class="control-panel-divider"></div>
  <!-- <button title="edit" onclick={() => console.log("edit")}>✏️</button> -->
  <button title="duplicate" onclick={() => globals.duplicateNode(id)}>⧉</button>
</div>
<div style={getOpacity()}>
  <Handle
    type="target"
    position={Position.Left}
    {isConnectable}
    style="width: {handleSize}px; height: {handleSize}px;"
  />
  <div class="sf-node" bind:this={displayedContent}>
    <div
      class="sf-node__label"
      style="font-size: {fontSize}px"
      contenteditable="true"
      spellcheck="false"
      bind:this={editable}
      oninput={handleLabelInput}
      onblur={handleLabelBlur}
      onmousedowncapture={stopPropagation}
      onmouseupcapture={stopPropagation}
      onclickcapture={stopPropagation}
      onkeydowncapture={handleLabelKeydown}
      oncompositionstartcapture={stopPropagation}
      oncompositionendcapture={stopPropagation}
    >
      {data.label}
    </div>
  </div>
  <NodeResizeControl
    onResizeEnd={handleResize}
    class="node-hover"
    title="resize"
    minWidth={100}
    minHeight={5}
    style="background: transparent; border: none;"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="rgb(200, 200, 200)"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="position: absolute; right: 5px; bottom: 5px;"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <polyline points="16 20 20 20 20 16" />
      <line x1="14" y1="14" x2="20" y2="20" />
      <polyline points="8 4 4 4 4 8" />
      <line x1="4" y1="4" x2="10" y2="10" />
    </svg>
  </NodeResizeControl>
  <Handle
    type="source"
    position={Position.Right}
    {isConnectable}
    style="width: {handleSize}px; height: {handleSize}px;"
  />
</div>
