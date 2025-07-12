
<script module>
  class BgColor {
    current = $state('#F7F9FB');
  }
  export const bgColor = new BgColor();
</script>
 
 <script lang="ts">
  import { SvelteFlowProvider } from '@xyflow/svelte';
  import Flow from './Flow.svelte';
</script>
 
<!-- You need the SvelteFlowProvider so you can useSvelteFlow  -->
<SvelteFlowProvider>
  <Flow />
</SvelteFlowProvider>