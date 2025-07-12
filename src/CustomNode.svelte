<!-- EditableNode.svelte: A custom node component for in-place editing of node labels in SvelteFlow -->
<script lang="ts">
  import { 
    type NodeProps,
    Handle,
    Position,
    } from '@xyflow/svelte';
  import { onMount } from 'svelte';
  let { isConnectable,id,data,selected }: NodeProps = $props();

  // Local state:
  let editing = $state(false);         // True when the label is being edited
  let inputEl = $state(null);                 // Reference to the <input> element for autofocus
  // Called when the label text is clicked — enter edit mode
  function startEdit() {
    editing = true;
  }

  // Called when the input loses focus — exit edit mode
  function finishEdit() {
    editing = false;
  }

  // Update the node's data as the user types
  function onInput(e) {
    data.label = e.target.value;
  }

  // Reactive statement: when editing turns true and inputEl is set, focus the input
  $effect: if (editing) {
    console.log("effect happened")
  if (inputEl){
    console.log("inputEl.focus");
    inputEl.focus();
  }
  }
</script>

<Handle type="target" position={Position.Left} {isConnectable}/>
<div class="sf-node">
  {#if editing}
    <input
      bind:this={inputEl}             
      bind:value={data.label}         
      onblur={finishEdit}            
      oninput={onInput}              
    />
  {:else}
    <div
      class="sf-node__label"
       onclick={startEdit}            
    >
      {data.label}             
    </div>
  {/if}
</div>
<Handle type="source" position={Position.Right} {isConnectable} />