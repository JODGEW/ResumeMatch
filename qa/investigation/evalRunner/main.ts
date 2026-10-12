import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { parseSweepCostLimit } from '../cost'
import { runEvalCase, stopsSweep, summaryTable, sweepCostUsd, SWEEP_STOPPING_ERRORS, sweepTotalLine } from './runCase'
import type { EvalCaseResult, EvalRunnerOptions } from './runCase'
import { cleanAdapterCommit } from './worktree'

function argumentValue(flag: string, fallback?: string): string {
  const index = process.argv.indexOf(flag)
  const value = index === -1 ? fallback : process.argv[index + 1]
  if (value === undefined) throw new Error(`evaluate requires ${flag}`)
  return value
}

/**
 * Run one or more public evaluation cases and write their results.
 *
 * Case ids are positional; every path is explicit, including the Node that runs
 * the harness, so a result never depends on PATH ordering.
 */
async function main(): Promise<number> {
  const cases = process.argv.slice(2).filter(item => /^[A-Z][0-9]{1,2}$/.test(item))
  if (cases.length === 0) throw new Error('evaluate requires at least one case id')
  const repositoryPath = process.cwd()
  const sweepLimitUsd = parseSweepCostLimit(process.argv.includes('--sweep-cost-limit') ? argumentValue('--sweep-cost-limit') : undefined)
  const options: EvalRunnerOptions = {
    repositoryPath,
    commit: argumentValue('--commit', execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath, encoding: 'utf8', env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    }).trim()),
    productNodePath: process.execPath,
    harnessNodePath: argumentValue('--harness-node'),
    harnessPath: argumentValue('--harness-path'),
    adapterPath: argumentValue('--adapter-path'),
    // Checked before any case starts, the way the ResumeMatch checkout is: a
    // dirty adapter would be recorded under a commit that did not run.
    adapterCommit: cleanAdapterCommit(argumentValue('--adapter-path')),
    configFile: argumentValue('--config', path.join(argumentValue('--adapter-path'), 'cordis.yml')),
    provider: argumentValue('--provider', 'resumematch-qa-fake'),
    heldOut: process.argv.includes('--held-out'),
    model: argumentValue('--model', 'scripted-investigation'),
    outputDirectory: argumentValue('--output', path.join(repositoryPath, '.qa-artifacts', 'evaluations')),
    sweepLimitUsd,
    // The sweep ceiling is enforced at the peak rates the evaluation is
    // authorized against; a lower rate here could only understate the spend.
    rates: {
      inputPerMillion: Number(argumentValue('--input-rate', '0.44')),
      outputPerMillion: Number(argumentValue('--output-rate', '1.32')),
      cacheHitPerMillion: Number(argumentValue('--cache-hit-rate', '0.014')),
    },
  }
  await mkdir(options.outputDirectory, { recursive: true, mode: 0o700 })

  const results: EvalCaseResult[] = []
  for (const caseId of cases) {
    const spentUsd = sweepCostUsd(results)
    process.stderr.write(`running ${caseId} on ${options.provider}/${options.model} (spent $${spentUsd.toFixed(4)} of $${sweepLimitUsd.toFixed(2)})\n`)
    const result = await runEvalCase(caseId, { ...options, spentUsd })
    results.push(result)
    await writeFile(path.join(options.outputDirectory, `${caseId}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    if (stopsSweep(result)) {
      process.stderr.write(`stopping the sweep after ${caseId}: ${result.errors.filter(error => SWEEP_STOPPING_ERRORS.includes(error)).join('; ')}\n`)
      break
    }
  }
  await writeFile(path.join(options.outputDirectory, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  process.stdout.write(`${summaryTable(results)}\n`)
  process.stdout.write(`${sweepTotalLine(results, sweepLimitUsd)}\n`)
  return results.every(item => item.triageMatched && item.errors.length === 0) ? 0 : 1
}

process.exitCode = await main()
