import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "/svelteflow-graph-editor/",
  plugins: [svelte()],
});
