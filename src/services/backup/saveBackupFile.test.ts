import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBackupFile, saveGeneratedBackup, type BackupFile } from './localBackupService'

const backup = (): BackupFile => ({ blob: new Blob(['backup']), fileName: 'test.researchmind', exportedAt: new Date().toISOString(), itemCount: 1 })
beforeEach(() => {
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4173' })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('backup destination lifecycle', () => {
  it('selects before generating and closes only after the entire blob is written', async () => {
    const events: string[] = []
    vi.stubGlobal('showSaveFilePicker', function(this: Window) {
      expect(this).toBe(window)
      events.push('picker')
      return Promise.resolve({ createWritable: async () => ({ write: async () => { events.push('write') }, close: async () => { events.push('close') }, abort: vi.fn() }) })
    })
    const result = await saveGeneratedBackup(async () => { events.push('generate'); return backup() })
    expect(events).toEqual(['picker', 'generate', 'write', 'close'])
    expect(result?.result).toBe('saved')
  })

  it('does not generate or download when the user cancels the picker', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    const generate = vi.fn(async () => backup())
    await expect(saveGeneratedBackup(generate)).rejects.toMatchObject({ name: 'AbortError' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('aborts a failed file write and propagates the original error', async () => {
    const abort = vi.fn().mockResolvedValue(undefined), close = vi.fn()
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue({ createWritable: async () => ({ write: async () => { throw new Error('disk full') }, close, abort }) }))
    await expect(saveGeneratedBackup(async () => backup())).rejects.toThrow('disk full')
    expect(abort).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
  })

  it('does not invoke a picker again when a destination has already been selected', async () => {
    const picker = vi.fn(), write = vi.fn(), close = vi.fn()
    vi.stubGlobal('showSaveFilePicker', picker)
    const destination = { createWritable: async () => ({ write, close }) } as unknown as FileSystemFileHandle
    expect(await saveBackupFile(backup(), destination)).toBe('saved')
    expect(picker).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
