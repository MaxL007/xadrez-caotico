import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/xadrez-caotico/',
  plugins: [react()],
})
