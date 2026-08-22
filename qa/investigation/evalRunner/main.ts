import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { runEvalCase, summaryTable } from './runCase'
import type { EvalCaseResult, EvalRunnerOptions } from './runCase'

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
  const options: EvalRunnerOptions = {
    repositoryPath,
    commit: argumentValue('--commit', execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath, encoding: 'utf8', env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    }).trim()),
    productNodePath: process.execPath,
    harnessNodePath: argumentValue('--harness-node'),
    harnessPath: argumentValue('--harness-path'),
    adapterPath: argumentValue('--adapter-path'),
    outputDirectory: argumentValue('--output', path.join(repositoryPath, '.qa-artifacts', 'evaluations')),
  }
  await mkdir(options.outputDirectory, { recursive: true, mode: 0o700 })

  const results: EvalCaseResult[] = []
  for (const caseId of cases) {
    process.stderr.write(`running ${caseId}\n`)
    const result = await runEvalCase(caseId, options)
    results.push(result)
    await writeFile(path.join(options.outputDirectory, `${caseId}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }
  await writeFile(path.join(options.outputDirectory, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  process.stdout.write(`${summaryTable(results)}\n`)
  return results.every(item => item.triageMatched && item.errors.length === 0) ? 0 : 1
}

process.exitCode = await main()
