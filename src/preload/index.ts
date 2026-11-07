import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ScoreCheckApi } from '../shared/ipc'

const api: ScoreCheckApi = {
  pickFiles: () => ipcRenderer.invoke('import:pick'),
  importPaths: (paths) => ipcRenderer.invoke('import:paths', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  setStudentMode: (on) => ipcRenderer.invoke('student-mode', on),
  createWork: (d) => ipcRenderer.invoke('work:create', d),
  saveProgress: (id, p) => ipcRenderer.invoke('progress:save', id, p),
  saveSignature: (id, key, payload) => ipcRenderer.invoke('signature:save', id, key, payload),
  phoneStart: () => ipcRenderer.invoke('phone:start'),
  phoneStop: () => ipcRenderer.invoke('phone:stop'),
  phoneRequest: (workId, key, label, aspect, rowImage) => ipcRenderer.invoke('phone:request', workId, key, label, aspect, rowImage),
  phoneIdle: () => ipcRenderer.invoke('phone:idle'),
  phoneState: () => ipcRenderer.invoke('phone:state'),
  onPhoneConnection: (cb) => {
    const h = (_e: unknown, v: boolean) => cb(v)
    ipcRenderer.on('phone:connection', h)
    return () => ipcRenderer.removeListener('phone:connection', h)
  },
  pdfCompose: (id, c) => ipcRenderer.invoke('pdf:compose', id, c),
  pdfSave: (id, cs) => ipcRenderer.invoke('pdf:save', id, cs),
  pdfRowPreview: (id, key) => ipcRenderer.invoke('pdf:row-preview', id, key),
  showInFolder: (p) => ipcRenderer.invoke('shell:show', p),
  listWorks: () => ipcRenderer.invoke('work:list'),
  openWork: (id) => ipcRenderer.invoke('work:open', id),
  deleteWork: (id) => ipcRenderer.invoke('work:delete', id),
  itemInfoSave: (id, info) => ipcRenderer.invoke('item-info:save', id, info),
  analysisExport: (id) => ipcRenderer.invoke('analysis:export', id),
  saveDiagnostics: () => ipcRenderer.invoke('diag:save'),
  reportError: (code) => ipcRenderer.invoke('diag:error', code),
  deleteSignatures: (id) => ipcRenderer.invoke('work:delete-signatures', id),
  onPhoneSaved: (cb) => {
    const h = (_e: unknown, v: { studentKey: string; revision: number }) => cb(v)
    ipcRenderer.on('phone:saved', h)
    return () => ipcRenderer.removeListener('phone:saved', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
