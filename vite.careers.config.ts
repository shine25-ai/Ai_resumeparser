import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Embeddable careers page: one script (React, styles and logo inside) for any website or project.
//   npm run dev:careers    -> http://localhost:5190
//   npm run build:careers  -> dist-careers/shinelogics-careers.js, careers.html (single file), index.html (example)
// The API address can be baked in with VITE_CAREERS_API_BASE_URL, or set per page with data-api.
const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ command }) => ({
  root: path("./careers"),
  envDir: path("."),
  plugins: [react(), tailwindcss()],
  // careers/index.html loads /src/careers/embed.tsx; point /src at the project's src folder.
  resolve: { alias: [{ find: /^\/src\//, replacement: path("./src/") }] },
  // React reads process.env.NODE_ENV; a library build must replace it.
  define: command === "build" ? { "process.env.NODE_ENV": JSON.stringify("production") } : {},
  server: { port: 5190 },
  preview: { port: 5190 },
  build: {
    outDir: path("./dist-careers"),
    emptyOutDir: true,
    assetsInlineLimit: 512 * 1024, // inline the logo so the script is one file
    lib: {
      entry: path("./src/careers/embed.tsx"),
      name: "ShinelogicsCareersBundle",
      formats: ["iife"],
      fileName: () => "shinelogics-careers.js",
    },
  },
}));
