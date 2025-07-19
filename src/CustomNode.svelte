<!-- EditableNode.svelte: A custom node component for in-place editing of node labels in SvelteFlow -->
<script lang="ts">
  import { type NodeProps, Handle, Position } from "@xyflow/svelte"; //test commit
  import { onMount } from "svelte";
  let { isConnectable, id, data, selected }: NodeProps = $props();

  let editable;

  // Whenever the user types, update `text` and let parent know
  function handleInput() {
    data.label = editable.innerText;
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
  const stopPropagation = (e: Event) => e.stopPropagation(); //used for giving input edit events priority over node drag events
</script>

<Handle type="target" position={Position.Left} {isConnectable} />
<div class="sf-node">
  <!-- TODO: checkbox -->
  <!-- TODO: top justify label -->
  <div
    class="sf-node__label"
    contenteditable="true"
    spellcheck="false"
    bind:this={editable}
    oninput={handleInput}
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
<Handle type="source" position={Position.Right} {isConnectable} />
