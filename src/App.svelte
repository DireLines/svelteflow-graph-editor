<script module>
  //functions on the graph state that need to be called from inside the node
  export const globalFuncs = $state({ recolorNodes: null });
</script>

<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";
</script>

<!-- You need the SvelteFlowProvider so you can useSvelteFlow  -->
<SvelteFlowProvider>
  <Flow />
</SvelteFlowProvider>
