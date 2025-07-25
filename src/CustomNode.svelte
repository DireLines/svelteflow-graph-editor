<!-- EditableNode.svelte: A custom node component for in-place editing of node labels in SvelteFlow -->
<script lang="ts">
  import { type NodeProps, Handle, Position } from "@xyflow/svelte"; //test commit
  import { onMount, tick } from "svelte";
  let { isConnectable, data }: NodeProps = $props();

  let editable;
  let editing = false;
  let completed = $state(data.completed);

  let styleOpacity = () => (completed ? "opacity: 30%" : "opacity: 100%");

  // Whenever the user types, update `text` and let parent know
  function handleLabelInput() {
    data.label = editable.innerText;
  }

  function handleCheckboxChange(e) {
    data.completed = completed;
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
  //used for giving input edit events priority over node drag events
  const stopPropagation = (e: Event) => {
    if (editing) {
      e.stopPropagation();
    }
  };
  // Turn on editing (and swallow events) on dblclick
  async function enableEdit() {
    editing = true;
    await tick(); // wait for DOM update
    editable.focus(); // give it the caret
    // Optionally move caret to click position:
    const sel = window.getSelection();
    if (sel.rangeCount === 0) {
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // When focus leaves, turn editing off
  function disableEdit() {
    editing = false;
  }
</script>

<div style={styleOpacity()}>
  <Handle type="target" position={Position.Left} {isConnectable} />
  <div class="sf-node">
    <div style="display:flex; flex-direction: row; gap:5px;">
      <!-- TODO: checkbox -->
      <input type="checkbox" bind:checked={completed as boolean} onchange={handleCheckboxChange} />
      <!-- TODO: click to focus -->
      <div
        class="sf-node__label"
        contenteditable="true"
        spellcheck="false"
        style="display: inline-block; vertical-align: middle; line-height: 20px;"
        bind:this={editable}
        oninput={handleLabelInput}
        onmousedowncapture={stopPropagation}
        onmouseupcapture={stopPropagation}
        onclickcapture={stopPropagation}
        onkeydowncapture={stopPropagation}
        oncompositionstartcapture={stopPropagation}
        oncompositionendcapture={stopPropagation}
        onblur={disableEdit}
      >
        {data.label}
      </div>
    </div>
  </div>
  <Handle type="source" position={Position.Right} {isConnectable} />
</div>
