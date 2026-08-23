import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

import { acquireQaLock, cleanupInvocationRuntime, QaLockError, releaseQaLock } from './processLock.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifactRoot = path.join(repositoryRoot, '.qa-artifacts')
const runtimeRoot = path.join(artifactRoot, 'runtime')
const originalHome = process.env.HOME ?? ''
const browserCache = os.platform() === 'darwin' ? path.join(originalHome, 'Library', 'Caches', 'ms-playwright') : path.join(originalHome, '.cache', 'ms-playwright')
const viteCli = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const playwrightCli = path.join(repositoryRoot, 'node_modules', '@playwright', 'test', 'cli.js')
const viteConfig = path.join(repositoryRoot, 'qa', 'browser', 'vite.qa.config.ts')
const investigateConfig = path.join(repositoryRoot, 'qa', 'investigation', 'vite.investigate.config.ts')
const investigateEntry = path.join(repositoryRoot, '.qa-artifacts', 'investigation-runtime', 'serverMain.mjs')
const evaluateConfig = path.join(repositoryRoot, 'qa', 'investigation', 'evalRunner', 'vite.evalRunner.config.ts')
const evaluateEntry = path.join(repositoryRoot, '.qa-artifacts', 'evaluation-runtime', 'main.mjs')
const previewUrl = 'http://127.0.0.1:4173/'

function sanitizedEnvironment(invocationRoot, token) {
  return {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: path.join(invocationRoot, 'home'), TMPDIR: path.join(invocationRoot, 'tmp'),
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'production', PLAYWRIGHT_BROWSERS_PATH: browserCache,
    QA_INVOCATION_ID: token, QA_LOCK_TOKEN: token,
    QA_APP_ORIGIN: 'http://127.0.0.1:4173', QA_API_ORIGIN: 'https://api.qa.invalid', QA_S3_ORIGIN: 'https://s3.qa.invalid',
    // Evaluation-case selection, forwarded explicitly rather than by spreading
    // the parent environment, so the sanitized environment stays enumerable.
    ...Object.fromEntries(['QA_EVAL_CASE', 'QA_EVAL_RESULT', 'QA_EVAL_WORKTREE_LABEL', 'QA_EVAL_HELD_OUT']
      .filter(name => process.env[name] !== undefined)
      .map(name => [name, process.env[name]])),
    VITE_DEV_BYPASS: 'true', VITE_API_BASE_URL: 'https://api.qa.invalid', VITE_API_KEY: 'qa-synthetic-api-key-not-secret',
    VITE_USER_POOL_ID: 'us-east-1_QaSynthetic', VITE_USER_POOL_CLIENT_ID: 'qasyntheticclient00000000000',
    VITE_COGNITO_OAUTH_DOMAIN: 'auth.qa.invalid', VITE_APP_URL: 'https://app.qa.invalid',
  }
}

function createSafeRuntimeDirectory(root, token, allowExisting) {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const rootStat = lstatSync(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || path.dirname(realpathSync(root)) !== artifactRoot) throw new Error('QA runtime root is unsafe')
  const invocation = path.join(root, token)
  mkdirSync(invocation, { recursive: allowExisting, mode: 0o700 })
  const invocationStat = lstatSync(invocation)
  if (invocationStat.isSymbolicLink() || realpathSync(invocation) !== invocation) throw new Error('QA invocation runtime is unsafe')
  return invocation
}

function runSync(args, environment, stdio = 'inherit') {
  const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, env: environment, stdio })
  if (result.error) throw result.error
  return result.status ?? 1
}

/** Wait for the QA preview server, whose stdout is suppressed to keep the investigate protocol clean. */
async function waitForPreview(deadlineMs) {
  const deadline = Date.now() + deadlineMs
  for (;;) {
    try {
      const response = await fetch(previewUrl)
      if (response.ok) return
    } catch {
      // Connection refused until the preview server binds; retried below.
    }
    if (Date.now() > deadline) throw new Error('QA preview server did not start')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/**
 * Serve the QA build and host one investigation over stdin/stdout.
 *
 * Phase 1 never launches this: an investigation is a separate invocation over an
 * accepted evidence bundle, so no model runtime is reachable from a release run.
 */
async function runInvestigation(commandArgs, environment) {
  const buildStatus = runSync([viteCli, 'build', '--config', viteConfig], environment, ['ignore', 'ignore', 'inherit'])
  if (buildStatus !== 0) return buildStatus
  const bundleStatus = runSync([viteCli, 'build', '--config', investigateConfig], environment, ['ignore', 'ignore', 'inherit'])
  if (bundleStatus !== 0) return bundleStatus
  const preview = spawn(process.execPath, [viteCli, 'preview', '--config', viteConfig, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: repositoryRoot, env: environment, stdio: ['ignore', 'ignore', 'inherit'],
  })
  try {
    await waitForPreview(30_000)
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [investigateEntry, ...commandArgs], {
        cwd: repositoryRoot, env: environment, stdio: ['inherit', 'inherit', 'inherit'],
      })
      child.once('error', reject)
      child.once('exit', code => resolve(code ?? 1))
    })
  } finally {
    preview.kill('SIGTERM')
  }
}

/**
 * Bundle and run the evaluation runner.
 *
 * The runner owns its own worktrees and child launchers, so it runs under the
 * caller's environment rather than the sanitized QA one: it must reach git, the
 * harness Node, and the parent PATH.
 */
function runEvaluation(commandArgs) {
  const bundleStatus = runSync([viteCli, 'build', '--config', evaluateConfig], sanitizedEnvironment(path.join(runtimeRoot, 'evaluate'), 'evaluate'), ['ignore', 'ignore', 'inherit'])
  if (bundleStatus !== 0) return bundleStatus
  return runSync([evaluateEntry, ...commandArgs], process.env)
}

function runAttached(args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repositoryRoot, env: environment, stdio: 'inherit' })
    const stopChild = () => child.kill('SIGTERM')
    process.once('SIGINT', stopChild); process.once('SIGTERM', stopChild)
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
}

async function main() {
  const [command, ...commandArgs] = process.argv.slice(2)
  if (!['build', 'serve', 'test', 'investigate', 'evaluate'].includes(command)) {
    process.stderr.write('Usage: node qa/browser/qaCommand.mjs <build|serve|test|investigate|evaluate>\n')
    return 2
  }
  // The evaluation runner creates its own worktrees, each with its own artifact
  // root and lock, so it must not hold the main checkout's lock while they run.
  if (command === 'evaluate') return runEvaluation(commandArgs)
  let lock
  let invocationRoot
  let status = 1
  try {
    lock = acquireQaLock(artifactRoot, process.env.QA_LOCK_TOKEN ?? null)
    invocationRoot = createSafeRuntimeDirectory(runtimeRoot, lock.token, lock.borrowed)
    mkdirSync(path.join(invocationRoot, 'home'), { recursive: true, mode: 0o700 })
    mkdirSync(path.join(invocationRoot, 'tmp'), { recursive: true, mode: 0o700 })
    const environment = sanitizedEnvironment(invocationRoot, lock.token)
    if (command === 'investigate') status = await runInvestigation(commandArgs, environment)
    else if (command === 'build') status = runSync([viteCli, 'build', '--config', viteConfig], environment)
    else if (command === 'serve') status = await runAttached([viteCli, 'preview', '--config', viteConfig, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], environment)
    else {
      const buildStatus = runSync([viteCli, 'build', '--config', viteConfig], environment)
      status = buildStatus !== 0 ? buildStatus : await runAttached([playwrightCli, 'test', ...commandArgs], environment)
    }
  } catch (error) {
    const payload = error instanceof QaLockError
      ? { code: error.code, message: error.message, owner: error.owner }
      : { code: 'QA_COMMAND_FAILED', message: error instanceof Error ? error.message : String(error) }
    process.stderr.write(`${JSON.stringify(payload)}\n`)
    status = error instanceof QaLockError ? (error.code === 'QA_LOCK_HELD' ? 73 : 76) : 1
  } finally {
    if (invocationRoot && lock && !lock.borrowed) {
      try { cleanupInvocationRuntime(invocationRoot, runtimeRoot) } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: 'QA_RUNTIME_CLEANUP_FAILED', message: String(error) })}\n`)
        if (status === 0) status = 74
      }
    }
    if (lock) {
      try { releaseQaLock(lock) } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: 'QA_LOCK_RELEASE_FAILED', message: String(error) })}\n`)
        if (status === 0) status = 75
      }
    }
  }
  return status
}

process.exitCode = await main()
