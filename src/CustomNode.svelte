<!-- EditableNode.svelte: A custom node component for in-place editing of node labels in SvelteFlow -->
<script lang="ts">
  import { type NodeProps, Handle, Position } from "@xyflow/svelte"; //test commit
  import { onMount, createEventDispatcher } from "svelte";
  let { isConnectable, id, data, selected }: NodeProps = $props();

  let text = "";
  const dispatch = createEventDispatcher();
  let editable;

  // Whenever the user types, update `text` and let parent know
  function handleInput() {
    data.label = editable.innerText;
    dispatch("change", { text: data.label });
  }

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
</script>

<Handle type="target" position={Position.Left} {isConnectable} />
<div class="sf-node">
  <div class="sf-node__label" contenteditable="true" bind:this={editable} oninput={handleInput}>
    {data.label}
  </div>
</div>
<Handle type="source" position={Position.Right} {isConnectable} />
