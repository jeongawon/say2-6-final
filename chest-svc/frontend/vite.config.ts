import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // chest-svc-v2 API proxy → 로컬 백엔드
  server: {
    proxy: {
      '/predict': 'http://localhost:8099',
      '/healthz': 'http://localhost:8099',
      '/readyz': 'http://localhost:8099',
      '/test-cases': 'http://localhost:8099',
      '/test-images': 'http://localhost:8099',
    },
  },
})
