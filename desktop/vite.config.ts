import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss()
  ],
  // Environment variables starting with VITE_ or TAURI_ENV_* will be exposed
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // 4. Add CORS settings for better plugin handling
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, Authorization"
    }
  },
  // 5. Properly handle source maps for plugins
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
    // Improve tree shaking
    commonjsOptions: {
      transformMixedEsModules: true, // Handle mixed ES/CommonJS modules better
    },
    // Optimize for smaller bundle size
    reportCompressedSize: true,
    // Fix CSS syntax errors by disabling aggressive minification
    cssMinify: false,
    rollupOptions: {
      output: {
        // Configure manual chunks to improve code splitting
        manualChunks: (id) => {
          // Group core UI components
          if (id.includes('@radix-ui')) {
            return 'vendor-radix';
          }
          
          // Group React and related libraries
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-hook-form')) {
            return 'vendor-react';
          }
          
          // Group the backend and crawler modules that have both dynamic and static imports
          if (id.includes('/src/lib/backend') || id.includes('/src/lib/crawler') || id.includes('/src/lib/processing-store')) {
            return 'app-backend';
          }
        }
      },
      // Tree-shaking optimizations
      treeshake: {
        moduleSideEffects: false, // Assume modules have no side effects
        propertyReadSideEffects: false, // Assume reading a property has no side effects
        tryCatchDeoptimization: false, // Don't preserve try-catch blocks
      },
    }
  }
});
