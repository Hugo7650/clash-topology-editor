import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/clash-topology-editor/',
  plugins: [vue()],
  server: { port: 5173 },
})
