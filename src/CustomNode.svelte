<script lang="ts">
  import {
    type NodeProps,
    Handle,
    Position,
    useNodeConnections,
    useNodesData,
    useSvelteFlow,
    NodeResizeControl,
  } from "@xyflow/svelte";
  import { onMount, onDestroy } from "svelte";
  import { globalFuncs } from "./App.svelte";
  import { registerNodeLabelElement, unregisterNodeLabelElement } from "./nodeElements";
  let { isConnectable, id, data }: NodeProps = $props();
  const { updateNodeData } = useSvelteFlow();

  let displayedContent: HTMLElement;
  onMount(() => {
    registerNodeLabelElement(id, displayedContent);
  });
  onDestroy(() => {
    unregisterNodeLabelElement(id);
  });

  let editable: HTMLElement;
  let completed = $state(data.completed);

  // let workable = $state(true);

  // let connections = useNodeConnections({
  //   handleType: "target",
  // });
  // const nodesData = $derived(useNodesData(connections.current.map((connection) => connection.source)));
  // useNodesData.subscribe((current) => {
  //   for (const node of current) {
  //     if (!node.data.completed) {
  //       workable = false;
  //     }
  //   }
  // });
  const getOpacity = () => (completed ? "opacity: 30%" : "opacity: 100%");

  // Whenever the user types, update `text` and let parent know
  const handleLabelInput = () => {
    data.label = editable.innerText;
    //TODO: update parent size recursively
    console.log(displayedContent.getBoundingClientRect()); //this gets rect in screen coordinates not flow coordinates
  };

  const handleCheckboxChange = (e) => {
    updateNodeData(id, { completed });
    globalFuncs.restyleGraph();
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
</script>

<div class="control-panel">
  <input type="checkbox" bind:checked={completed as boolean} onchange={handleCheckboxChange} />
  <!-- add more buttons here -->
  <!-- TODO: click to edit node -->
  <!-- <button onclick={() => console.log("edit")}>✏️</button> -->
  <!-- TODO: click to focus -->
  <!-- <button onclick={() => console.log("focus")}>⛶</button> -->
</div>
<div style={getOpacity()}>
  <Handle type="target" position={Position.Left} {isConnectable} />
  <div class="sf-node" bind:this={displayedContent}>
    <div
      class="sf-node__label"
      contenteditable="true"
      spellcheck="false"
      bind:this={editable}
      oninput={handleLabelInput}
      onmousedowncapture={stopPropagation}
      onmouseupcapture={stopPropagation}
      onclickcapture={stopPropagation}
      onkeydowncapture={stopPropagation}
      oncompositionstartcapture={stopPropagation}
      oncompositionendcapture={stopPropagation}
    >
      {data.label}
    </div>
  </div>
  <NodeResizeControl class="node-hover" minWidth={100} minHeight={5} style="background: transparent; border: none;">
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
  <Handle type="source" position={Position.Right} {isConnectable} />
</div>
