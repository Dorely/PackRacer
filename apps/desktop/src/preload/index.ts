import { contextBridge, ipcRenderer } from 'electron'

const packRacerApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
}

contextBridge.exposeInMainWorld('packRacer', packRacerApi)

export type PackRacerApi = typeof packRacerApi
