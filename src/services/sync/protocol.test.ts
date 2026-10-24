import { describe, expect, it } from 'vitest'
import { digestRow, emptySyncIndex, planSync } from './protocol'

describe('personal multi-device sync planning', () => {
  it('merges independent changes from either side', () => {
    const base = emptySyncIndex(), local = emptySyncIndex(), remote = emptySyncIndex()
    base.documents = { one: 'old-one', two: 'old-two' }
    local.documents = { one: 'changed-one', two: 'old-two' }
    remote.documents = { one: 'old-one', two: 'changed-two' }
    const result = planSync(base, local, remote)
    expect(result.upload.documents).toEqual(['one'])
    expect(result.download.documents).toEqual(['two'])
    expect(result.conflicts).toEqual([])
  })
  it('preserves offline edits and rejects concurrent modifications of the same record', () => {
    const base = emptySyncIndex(), local = emptySyncIndex(), remote = emptySyncIndex()
    base.documents.one = 'original'; local.documents.one = 'offline edit'; remote.documents.one = 'another device edit'
    expect(planSync(base, local, remote).conflicts).toEqual([{ table: 'documents', id: 'one' }])
    expect(local.documents.one).toBe('offline edit')
    expect(remote.documents.one).toBe('another device edit')
  })
  it('propagates physical deletions only against a known common baseline', () => {
    const base = emptySyncIndex(), local = emptySyncIndex(), remote = emptySyncIndex()
    base.versions.old = 'original'; remote.versions.old = 'original'
    remote.documents.remoteOnly = 'new'; local.documents.localOnly = 'new'
    const result = planSync(base, local, remote)
    expect(result.upload.versions).toEqual(['old'])
    expect(result.download.documents).toEqual(['remoteOnly'])
    expect(result.upload.documents).toEqual(['localOnly'])
  })
  it('does not conflict when both devices independently reached identical content', () => {
    const base = emptySyncIndex(), local = emptySyncIndex(), remote = emptySyncIndex()
    base.documents.one = 'old'; local.documents.one = remote.documents.one = 'same new content'
    expect(planSync(base, local, remote).conflicts).toEqual([])
    expect(planSync(base, local, remote).upload.documents).toEqual([])
  })
  it('hashes object key order consistently across Node and browsers', async () => {
    expect(await digestRow({ b: 1, a: { z: 2, x: '论文' } })).toBe(await digestRow({ a: { x: '论文', z: 2 }, b: 1 }))
    expect(await digestRow({ a: 1 })).not.toBe(await digestRow({ a: 2 }))
  })
})
