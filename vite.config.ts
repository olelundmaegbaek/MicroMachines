import { defineConfig } from 'vite'

// GitHub Pages serves this project under /MicroMachines/, so every asset URL
// needs that prefix in a production build. `npm run dev` stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/MicroMachines/' : '/',
}))
