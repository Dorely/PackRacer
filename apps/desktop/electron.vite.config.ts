import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@packracer/race-engine': resolve(__dirname, '../../packages/race-engine/src/index.ts'),
        '@packracer/timer-adapters': resolve(__dirname, '../../packages/timer-adapters/src/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@packracer/race-engine': resolve(__dirname, '../../packages/race-engine/src/index.ts'),
        '@packracer/timer-adapters': resolve(__dirname, '../../packages/timer-adapters/src/index.ts')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          timerSimulator: resolve(__dirname, 'src/renderer/timer-simulator.html')
        }
      }
    }
  }
})
