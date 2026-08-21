import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { createSafeRunDirectory, removeSafeRunDirectory } from '../../qa/browser/artifactPaths'

test('run output is contained and exact UUID cleanup succeeds', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const approved = testInfo.outputPath('approved')
  const runId = `p1-01-${randomUUID()}`
  const paths = await createSafeRunDirectory(approved, path.join(approved, 'runs'), runId)
  expect(paths.runDirectory).toBe(path.join(paths.runsRoot, runId))
  await removeSafeRunDirectory(paths, runId)
  await expect(removeSafeRunDirectory(paths, runId)).resolves.toBeUndefined()
})

test('missing exact generated UUID directory is already-clean success', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const approved = testInfo.outputPath('approved-missing')
  const runId = `p1-01-${randomUUID()}`
  const paths = await createSafeRunDirectory(approved, path.join(approved, 'runs'), runId)
  await rm(paths.runDirectory, { recursive: true })
  await expect(removeSafeRunDirectory(paths, runId)).resolves.toBeUndefined()
})

test('symlinked run path components and caller traversal are rejected', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const approved = testInfo.outputPath('approved-symlink')
  const outside = testInfo.outputPath('outside')
  await mkdir(approved, { recursive: true })
  await mkdir(outside, { recursive: true })
  await symlink(outside, path.join(approved, 'runs'))
  await expect(createSafeRunDirectory(approved, path.join(approved, 'runs'), `p1-01-${randomUUID()}`)).rejects.toThrow(/real directory|symlink/)
  await expect(createSafeRunDirectory(approved, outside, `p1-01-${randomUUID()}`)).rejects.toThrow(/approved artifact root/)
})

test('cleanup rejects a replacement symlink without touching its outside target', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const approved = testInfo.outputPath('approved-cleanup-symlink')
  const outside = testInfo.outputPath('outside-cleanup-target')
  const marker = path.join(outside, 'keep.txt')
  const runId = `p1-01-${randomUUID()}`
  const paths = await createSafeRunDirectory(approved, path.join(approved, 'runs'), runId)
  await mkdir(outside, { recursive: true })
  await writeFile(marker, 'keep')
  await rm(paths.runDirectory, { recursive: true })
  await symlink(outside, paths.runDirectory)
  try {
    await expect(removeSafeRunDirectory(paths, runId)).rejects.toThrow(/symlink/)
    await expect(writeFile(marker, 'still-here')).resolves.toBeUndefined()
  } finally {
    await unlink(paths.runDirectory)
  }
})

test('cleanup rejects an outside-root path even with a valid run UUID', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const approved = testInfo.outputPath('approved-outside-cleanup')
  const outside = testInfo.outputPath('outside-cleanup')
  const runId = `p1-01-${randomUUID()}`
  const paths = await createSafeRunDirectory(approved, path.join(approved, 'runs'), runId)
  const outsideRun = path.join(outside, runId)
  await mkdir(outsideRun, { recursive: true })
  await expect(removeSafeRunDirectory({ ...paths, runDirectory: outsideRun }, runId)).rejects.toThrow(/not created by this harness/)
  await rm(paths.runDirectory, { recursive: true })
})

test('cleanup propagates non-ENOENT filesystem deletion failures', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const approved = testInfo.outputPath('approved-permission-cleanup')
  const runId = `p1-01-${randomUUID()}`
  const paths = await createSafeRunDirectory(approved, path.join(approved, 'runs'), runId)
  await chmod(paths.runsRoot, 0o500)
  try {
    await expect(removeSafeRunDirectory(paths, runId)).rejects.toThrow()
  } finally {
    await chmod(paths.runsRoot, 0o700)
    await removeSafeRunDirectory(paths, runId)
  }
})
