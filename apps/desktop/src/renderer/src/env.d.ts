/// <reference types="vite/client" />

interface Window {
  packRacer: {
    getVersion: () => Promise<string>
  }
}
