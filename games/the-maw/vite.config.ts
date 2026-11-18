import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
// one self-contained index.html (it is published as an artifact)
export default defineConfig({ plugins: [viteSingleFile()], build: { target: "es2022", assetsInlineLimit: 100000000 }, test: { globals: true, environment: "node" } as never });
