import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [react(), tailwindcss()],
  }
})
