import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { expect, test } from '@playwright/test'

import { acquireQaLock, cleanupInvocationRuntime, releaseQaLock } from '../../qa/browser/processLock.mjs'

const lockModuleUrl = pathToFileURL(path.join(process.cwd(), 'qa', 'browser', 'processLock.mjs')).href

function waitForLine(stream: NodeJS.ReadableStream, expected: string, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${expected}`)) }, timeoutMs)
    const onData = (chunk: Buffer | string) => {
      output += chunk.toString()
      if (output.includes(expected)) { cleanup(); resolve(output) }
    }
    const onEnd = () => { cleanup(); reject(new Error(`Process ended before ${expected}: ${output}`)) }
    const cleanup = () => { clearTimeout(timeout); stream.off('data', onData); stream.off('end', onEnd) }
    stream.on('data', onData); stream.on('end', onEnd)
  })
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs = 5_000): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for child exit')) }, timeoutMs)
    const onExit = (code: number | null) => { cleanup(); resolve(code) }
    const cleanup = () => { clearTimeout(timeout); child.off('exit', onExit) }
    child.once('exit', onExit)
  })
}

test('real process lock conflict preserves the live owner and succeeds after release', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const root = testInfo.outputPath('process-lock-root')
  const ownerScript = `
    const { acquireQaLock, releaseQaLock } = await import(process.argv[1]);
    const lock = acquireQaLock(process.argv[2]);
    process.stdout.write('READY\\n');
    process.stdin.resume();
    process.stdin.once('data', () => { releaseQaLock(lock); process.stdout.write('RELEASED\\n'); process.exit(0); });
  `
  const contenderScript = `
    const { acquireQaLock } = await import(process.argv[1]);
    try { acquireQaLock(process.argv[2]); process.exitCode = 1; }
    catch (error) { process.stderr.write(JSON.stringify({ code: error.code, message: error.message }) + '\\n'); process.exitCode = error.code === 'QA_LOCK_HELD' ? 73 : 2; }
  `
  const owner = spawn(process.execPath, ['--input-type=module', '-e', ownerScript, lockModuleUrl, root], { stdio: ['pipe', 'pipe', 'pipe'] })
  try {
    await waitForLine(owner.stdout, 'READY')
    const ownerPath = path.join(root, 'qa-command.lock', 'owner.json')
    const ownerRecordBefore = await readFile(ownerPath, 'utf8')
    const contender = spawnSync(process.execPath, ['--input-type=module', '-e', contenderScript, lockModuleUrl, root], { encoding: 'utf8', timeout: 5_000 })
    expect(contender.status).toBe(73)
    expect(JSON.parse(contender.stderr)).toMatchObject({ code: 'QA_LOCK_HELD' })
    expect(() => process.kill(owner.pid!, 0)).not.toThrow()
    expect(await readFile(ownerPath, 'utf8')).toBe(ownerRecordBefore)

    owner.stdin.write('release\n')
    expect(await waitForExit(owner)).toBe(0)
    const replacement = acquireQaLock(root)
    releaseQaLock(replacement)
  } finally {
    if (owner.exitCode === null) {
      owner.stdin.write('release\n')
      try { await waitForExit(owner, 2_000) } catch { owner.kill('SIGTERM') }
    }
  }
})

test('inherited child operations borrow the exact live owner token', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const root = testInfo.outputPath('borrowed-lock-root')
  const lock = acquireQaLock(root)
  try {
    const borrowed = acquireQaLock(root, lock.token)
    expect(borrowed.borrowed).toBe(true)
    releaseQaLock(borrowed)
  } finally {
    releaseQaLock(lock)
  }
})

test('invocation runtime cleanup removes only an exact child', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const root = testInfo.outputPath('runtime-root')
  const invocation = path.join(root, '12345678-safe-token')
  await mkdir(invocation, { recursive: true })
  await writeFile(path.join(invocation, 'cache'), 'synthetic')
  cleanupInvocationRuntime(invocation, root)
  expect(() => cleanupInvocationRuntime(root, root)).toThrow()
})

test('dead-owner lock fails closed and remains byte-for-byte untouched', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const root = testInfo.outputPath('stale-lock-root')
  const lockDirectory = path.join(root, 'qa-command.lock')
  const ownerPath = path.join(lockDirectory, 'owner.json')
  const ownerRecord = `${JSON.stringify({ pid: 2_147_483_647, token: randomUUID(), createdAt: '2026-01-01T00:00:00Z' })}\n`
  await mkdir(lockDirectory, { recursive: true })
  await writeFile(ownerPath, ownerRecord)
  let observedError: unknown
  try { acquireQaLock(root) } catch (error) { observedError = error }
  expect(observedError).toMatchObject({ code: 'QA_STALE_LOCK' })
  let inheritedError: unknown
  try { acquireQaLock(root, JSON.parse(ownerRecord).token) } catch (error) { inheritedError = error }
  expect(inheritedError).toMatchObject({ code: 'QA_STALE_LOCK' })
  expect(await readFile(ownerPath, 'utf8')).toBe(ownerRecord)
})
