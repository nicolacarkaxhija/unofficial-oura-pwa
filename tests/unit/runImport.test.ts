import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runImport, MAX_ZIP_BYTES } from '@/workers/runImport'

// ─── runImport in-flight lock tests ───────────────────────────────────────────
//
// The lock exists because two call sites can legitimately race: App.tsx's
// Safari-eviction recovery fires on boot while the user may simultaneously
// start a manual import. These tests replace the real Worker with a
// hand-rolled stub (jsdom has no Worker at all) so we can count constructions
// and settle the import on demand — the coalescing contract is "N concurrent
// calls, exactly one worker, one shared promise".

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: { data: { type: string; payload?: { message?: string } } }) => void) | null =
    null
  onerror: ((err: { message: string }) => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(): void {
    // The real worker starts parsing here; the stub waits for the test to
    // fire `done`/`error` via emit().
  }
  terminate(): void {
    this.terminated = true
  }
  emit(type: string, message?: string): void {
    this.onmessage?.({ data: message !== undefined ? { type, payload: { message } } : { type } })
  }
}

// noUncheckedIndexedAccess-safe accessor: failing loudly here beats a cryptic
// "cannot read properties of undefined" inside an assertion.
function worker(i: number): FakeWorker {
  const w = FakeWorker.instances[i]
  if (!w) throw new Error(`no FakeWorker at index ${String(i)}`)
  return w
}

describe('runImport (double-import lock)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  it('coalesces concurrent calls onto the same promise and a single worker', async () => {
    const p1 = runImport(new Blob(['a']))
    const p2 = runImport(new Blob(['b'])) // different blob — still coalesced; first import wins

    expect(p2).toBe(p1)
    expect(FakeWorker.instances).toHaveLength(1)

    worker(0).emit('done')
    await expect(p1).resolves.toBeUndefined()
    expect(worker(0).terminated).toBe(true)
  })

  it('releases the lock after success so a later import spawns a fresh worker', async () => {
    const p1 = runImport(new Blob(['a']))
    worker(0).emit('done')
    await p1

    const p2 = runImport(new Blob(['b']))
    expect(p2).not.toBe(p1)
    expect(FakeWorker.instances).toHaveLength(2)
    worker(1).emit('done')
    await p2
  })

  it('releases the lock after failure so the user can retry', async () => {
    const p1 = runImport(new Blob(['a']))
    worker(0).emit('error', 'corrupt zip')
    await expect(p1).rejects.toThrow('corrupt zip')

    const p2 = runImport(new Blob(['b']))
    expect(FakeWorker.instances).toHaveLength(2)
    worker(1).emit('done')
    await expect(p2).resolves.toBeUndefined()
  })

  it('rejects oversized files without taking the lock', async () => {
    // A wrong-file mistake must not block the immediate retry with the right file.
    const big = { size: MAX_ZIP_BYTES + 1 } as Blob
    await expect(runImport(big)).rejects.toThrow('File too large')
    expect(FakeWorker.instances).toHaveLength(0)

    const p = runImport(new Blob(['ok']))
    expect(FakeWorker.instances).toHaveLength(1)
    worker(0).emit('done')
    await p
  })
})
