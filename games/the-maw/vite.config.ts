import { defineConfig } from "vite";
// The run layer builds to one classic script beside the tank's other shared engine scripts (window.MawRun)
export default defineConfig({
  build: {
    lib: { entry: "src/run/index.ts", name: "MawRunBundle", formats: ["iife"], fileName: () => "maw-run.js" },
    outDir: "../../shared/engine/ecology", emptyOutDir: false, minify: false, target: "es2020",
  },
  test: { globals: true, environment: "node" } as never,
});
