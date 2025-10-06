<script module>
  //functions on the graph state that need to be called from inside the node
  //intended to be set from the graph initialization code
  //TODO: it's somewhat wrong to have these globally scoped instead of scoped to the Flow component -
  //that assumes there is only one Flow component. But not sure how to scope to Flow
  export const globals = $state({ refresh: null, graph: null });
</script>

<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";
</script>

<SvelteFlowProvider>
  <Flow />
</SvelteFlowProvider>
