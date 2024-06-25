import { config } from "dotenv";
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
 
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    env: {
      ...config({ path: "./.env.test" }).parsed,
    },
  },
})
