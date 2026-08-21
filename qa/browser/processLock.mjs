import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export class QaLockError extends Error {
  constructor(code, message, owner = null) {
    super(message)
    this.name = 'QaLockError'
    this.code = code
    this.owner = owner
  }
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error?.code === 'ESRCH' ? false : null }
}

function safeRoot(rootInput) {
  mkdirSync(rootInput, { recursive: true, mode: 0o700 })
  const stat = lstatSync(rootInput)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new QaLockError('QA_STALE_LOCK', 'QA artifact root must be a real directory')
  return realpathSync(rootInput)
}

export function acquireQaLock(rootInput, inheritedToken = null) {
  const root = safeRoot(rootInput)
  const lockDirectory = path.join(root, 'qa-command.lock')
  const ownerPath = path.join(lockDirectory, 'owner.json')
  try {
    mkdirSync(lockDirectory, { mode: 0o700 })
    const token = randomUUID()
    const owner = { pid: process.pid, token, createdAt: new Date().toISOString() }
    writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`, { mode: 0o600 })
    return { root, lockDirectory, ownerPath, token, borrowed: false }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }

  let owner
  try {
    const stat = lstatSync(lockDirectory)
    if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(lockDirectory) !== lockDirectory) throw new Error('unsafe lock path')
    owner = JSON.parse(readFileSync(ownerPath, 'utf8'))
  } catch {
    throw new QaLockError('QA_STALE_LOCK', 'QA lock exists but is malformed or unverifiable; inspect owner.json and recover it manually')
  }
  if (
    !owner
    || !Number.isInteger(owner.pid)
    || owner.pid < 1
    || typeof owner.token !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner.token)
    || typeof owner.createdAt !== 'string'
    || !Number.isFinite(Date.parse(owner.createdAt))
  ) {
    throw new QaLockError('QA_STALE_LOCK', 'QA lock owner is malformed; inspect owner.json and recover it manually')
  }
  const alive = processIsAlive(owner.pid)
  if (inheritedToken && owner.token === inheritedToken && alive === true) return { root, lockDirectory, ownerPath, token: owner.token, borrowed: true }
  if (alive === true) throw new QaLockError('QA_LOCK_HELD', `Another QA invocation owns the lock (pid ${owner.pid})`, { pid: owner.pid, createdAt: owner.createdAt })
  throw new QaLockError(
    'QA_STALE_LOCK',
    alive === false
      ? `QA lock owner pid ${owner.pid} is not running; inspect owner.json before manually removing the lock`
      : `QA lock owner pid ${owner.pid} could not be verified; inspect owner.json before manual recovery`,
    { pid: owner.pid, createdAt: owner.createdAt },
  )
}

export function releaseQaLock(lock) {
  if (lock.borrowed) return
  const stat = lstatSync(lock.lockDirectory)
  const current = JSON.parse(readFileSync(lock.ownerPath, 'utf8'))
  if (stat.isSymbolicLink() || current.token !== lock.token || realpathSync(lock.lockDirectory) !== lock.lockDirectory) throw new QaLockError('QA_STALE_LOCK', 'Refusing to release a lock no longer owned by this invocation')
  rmSync(lock.lockDirectory, { recursive: true })
}

export function cleanupInvocationRuntime(runtimeDirectory, approvedRuntimeRoot) {
  const root = realpathSync(approvedRuntimeRoot)
  const candidate = realpathSync(runtimeDirectory)
  if (path.dirname(candidate) !== root || path.basename(candidate).length < 8 || lstatSync(candidate).isSymbolicLink()) throw new Error('Refusing unsafe invocation-runtime cleanup')
  rmSync(candidate, { recursive: true })
}
