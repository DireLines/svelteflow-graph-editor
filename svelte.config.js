// svelte.config.js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  kit: {
    paths: {
      base: process.env.NODE_ENV === "production" ? "/svelteflow-graph-editor" : "",
    },
  },
};
