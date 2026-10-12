import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { EVAL_CASES, verifyMutationAnchors } from './evalCases'
import { HELD_OUT_CASES, HELD_OUT_CASE_IDS } from './evalCases.heldout'
import { MINIMAL_NARRATIVE_EXAMPLE } from './finding'
import { goldEvidenceProbes } from './goldEvidence'
import { heldOutDefinitionDirectory, loadHeldOutDefinition, resolveEvalCase } from './heldoutDefinitions'
import { goldRootCause } from './rootCauseGold'

describe('evaluation corpus', () => {
  // Thirteen, not the original twelve: B4 replaces B2 in the held-out slot while
  // B2 stays in the corpus as a public benign case. Seventeen since slice 4 added
  // D7, D8, D9 and B5 to the public half. Twenty since step 5 added D10, D11 and
  // B6 to the held-out half.
  it('holds three clean, eleven seeded, and six benign cases across both halves', () => {
    expect(EVAL_CASES.length + HELD_OUT_CASES.length).toBe(20)
    expect(EVAL_CASES.filter(item => item.kind === 'clean')).toHaveLength(3)
    const seeded = EVAL_CASES.filter(item => item.kind === 'seeded_defect').length
      + HELD_OUT_CASES.filter(item => item.kind === 'seeded_defect').length
    const benign = EVAL_CASES.filter(item => item.kind === 'benign_transient').length
      + HELD_OUT_CASES.filter(item => item.kind === 'benign_transient').length
    expect({ seeded, benign }).toEqual({ seeded: 11, benign: 6 })
    const ids = [...EVAL_CASES.map(item => item.id), ...HELD_OUT_CASE_IDS]
    expect(new Set(ids).size).toBe(20)
  })

  it('holds out D5, D6, D10, D11, B4, and B6', () => {
    expect([...HELD_OUT_CASE_IDS].sort()).toEqual(['B4', 'B6', 'D10', 'D11', 'D5', 'D6'])
  })

  it('keeps B2 in the public set with no gold probe', () => {
    const b2 = EVAL_CASES.find(item => item.id === 'B2')
    expect(b2?.transientFaults).toEqual(['analysis_interrupted_once'])
    expect(b2?.goldFirstProbe).toBeUndefined()
  })
})

describe('held-out isolation gate', () => {
  it('leaks no held-out id into the public corpus', () => {
    for (const id of HELD_OUT_CASE_IDS) {
      expect(EVAL_CASES.map(item => item.id)).not.toContain(id)
    }
  })

  it('carries no mutation, fault, or gold probe for any held-out case', () => {
    const serialized = JSON.stringify(EVAL_CASES)
    for (const id of HELD_OUT_CASE_IDS) expect(serialized).not.toContain(`"${id}"`)
    for (const heldOut of HELD_OUT_CASES) {
      expect(Object.keys(heldOut).sort()).toEqual(['expectedClassification', 'expectedTriage', 'id', 'kind', 'scenarioId'])
      expect(heldOut).not.toHaveProperty('mutation')
      expect(heldOut).not.toHaveProperty('transientFaults')
      expect(heldOut).not.toHaveProperty('goldFirstProbe')
    }
  })

  it('refuses held-out definitions without an explicit opt-in', async () => {
    await expect(loadHeldOutDefinition('D5', false)).rejects.toThrow(/explicit --held-out opt-in/)
    await expect(loadHeldOutDefinition('D1', true)).rejects.toThrow(/not a held-out case/)
  })

  it('keeps held-out definitions out of the repository', () => {
    expect(heldOutDefinitionDirectory('/repo')).toBe('/repo/qa/investigation/heldout')
  })
})

describe('public corpus rules', () => {
  it('expects B3 to pass its oracle rather than reach an investigator', () => {
    const b3 = EVAL_CASES.find(item => item.id === 'B3')
    expect({ triage: b3?.expectedTriage, classification: b3?.expectedClassification, gold: b3?.goldFirstProbe })
      .toEqual({ triage: 'expected', classification: null, gold: undefined })
    expect(b3?.transientFaults).toEqual(['s3_response_500_once'])
  })

  it('never expects a confirmed finding for a clean or benign case', () => {
    for (const testCase of EVAL_CASES.filter(item => item.kind !== 'seeded_defect')) {
      expect(testCase.expectedClassification).not.toBe('confirmed')
    }
  })

  it('never invokes the investigator for a clean case', () => {
    for (const testCase of EVAL_CASES.filter(item => item.kind === 'clean')) {
      expect(testCase.expectedTriage).toBe('expected')
      expect(testCase.expectedClassification).toBeNull()
    }
  })

  it('anchors every seeded defect to exactly one place in the current source', async () => {
    const anchors = await verifyMutationAnchors()
    expect(anchors.map(anchor => anchor.id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D7', 'D8', 'D9'])
    for (const anchor of anchors) {
      expect({ id: anchor.id, occurrences: anchor.occurrences }).toEqual({ id: anchor.id, occurrences: 1 })
    }
  })
})

describe('case resolution across both halves', () => {
  it('resolves a public case without any held-out opt-in', async () => {
    const d1 = await resolveEvalCase('D1', EVAL_CASES, false)
    expect({ id: d1?.id, scenario: d1?.scenarioId, gold: d1?.goldFirstProbe })
      .toEqual({ id: 'D1', scenario: 'P1-01', gold: 'read_network_events' })
  })

  it('refuses a held-out case without the opt-in', async () => {
    await expect(resolveEvalCase('D5', EVAL_CASES, false)).rejects.toThrow(/explicit --held-out opt-in/)
  })

  it('returns undefined for an id in neither half', async () => {
    expect(await resolveEvalCase('Z9', EVAL_CASES, true)).toBeUndefined()
  })

  it('defines D7, D8, D9 and B5 as designed in slice 4', () => {
    const byId = new Map(EVAL_CASES.map(item => [item.id, item]))
    const shape = (id: string) => {
      const item = byId.get(id)
      return {
        kind: item?.kind, scenario: item?.scenarioId, file: item?.mutation?.file, faults: item?.transientFaults ?? [],
        triage: item?.expectedTriage, classification: item?.expectedClassification, gold: item?.goldFirstProbe,
      }
    }
    expect(shape('D7')).toEqual({
      kind: 'seeded_defect', scenario: 'P1-02', file: 'src/hooks/usePolling.ts', faults: ['analysis_interrupted_once'],
      triage: 'investigate', classification: 'confirmed', gold: undefined,
    })
    expect(shape('D8')).toEqual({
      kind: 'seeded_defect', scenario: 'P1-02', file: 'src/api/upload.ts', faults: ['upload_503_once'],
      triage: 'investigate', classification: 'inconclusive', gold: undefined,
    })
    expect(shape('D9')).toEqual({
      kind: 'seeded_defect', scenario: 'P1-02', file: 'src/api/analysis.ts', faults: [],
      triage: 'investigate', classification: 'confirmed', gold: undefined,
    })
    expect(shape('B5')).toEqual({
      kind: 'benign_transient', scenario: 'P1-05', file: undefined, faults: ['analysis_interrupted_once'],
      triage: 'investigate', classification: 'not_reproduced', gold: undefined,
    })
    // A mutation must actually change the line, and none may touch the route the example narrative uses.
    for (const id of ['D7', 'D8', 'D9']) {
      const mutation = byId.get(id)?.mutation
      expect(mutation?.replace).not.toBe(mutation?.find)
      expect(`${mutation?.find}${mutation?.replace}`).not.toMatch(/last-resume|lastResume/i)
    }
  })
})

describe('held-out answers', () => {
  // Fixtures are written under a temporary root, never in the repository's
  // heldout/ directory, and use only a held-out id, not any held-out content.
  const ID = HELD_OUT_CASE_IDS[0]
  const ANSWER = { attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' }

  async function withDefinition(definition: Record<string, unknown>, run: (root: string) => Promise<void>): Promise<void> {
    const root = await mkdtemp(path.join(tmpdir(), 'qa-heldout-fixture-'))
    try {
      await mkdir(heldOutDefinitionDirectory(root), { recursive: true })
      await writeFile(path.join(heldOutDefinitionDirectory(root), `${ID}.json`), JSON.stringify({ caseId: ID, ...definition }), 'utf8')
      await run(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  it('grades a held-out case from the answer and evidence set in its definition', async () => {
    await withDefinition({ rootCause: ANSWER, goldEvidenceProbes: ['read_network_events'] }, async root => {
      const definition = await loadHeldOutDefinition(ID, true, root)
      expect(goldRootCause(ID, definition)).toEqual(ANSWER)
      expect(goldEvidenceProbes(ID, definition)).toEqual(['read_network_events'])
    })
  })

  it('leaves a held-out case ungraded when its definition carries no answers, or none is given', async () => {
    await withDefinition({}, async root => {
      const definition = await loadHeldOutDefinition(ID, true, root)
      expect([goldRootCause(ID, definition), goldEvidenceProbes(ID, definition), goldRootCause(ID), goldEvidenceProbes(ID)])
        .toEqual([null, null, null, null])
    })
  })

  it('never lets a held-out definition answer for a public case', async () => {
    await withDefinition({ rootCause: ANSWER, goldEvidenceProbes: ['read_network_events'] }, async root => {
      const definition = await loadHeldOutDefinition(ID, true, root)
      expect(goldRootCause('C1', definition)).toBeNull()
      expect(goldRootCause('D1', definition)).toEqual(goldRootCause('D1'))
      expect(goldEvidenceProbes('B2', definition)).toBeNull()
    })
  })

  it('refuses a gold answer or evidence set the grader could not use', async () => {
    const refused: Array<Record<string, unknown>> = [
      { rootCause: { attribution: 'undetermined', routeTemplate: null, failureMode: null } },
      { rootCause: { ...ANSWER, routeTemplate: '/sample' } },
      { rootCause: { ...ANSWER, failureMode: 'slow_response' } },
      { rootCause: { ...ANSWER, routeTemplate: null } },
      { rootCause: { ...ANSWER, note: 'extra' } },
      { goldEvidenceProbes: [] },
      { goldEvidenceProbes: ['read_network_events', 3] },
    ]
    for (const definition of refused) {
      await withDefinition(definition, async root => {
        await expect(loadHeldOutDefinition(ID, true, root)).rejects.toThrow(/Held-out definition for .+ has an invalid (rootCause|goldEvidenceProbes)/)
      })
    }
  })

  it("refuses a gold answer equal to the example narrative's, which every rejected submission returns", async () => {
    await withDefinition({ rootCause: MINIMAL_NARRATIVE_EXAMPLE.rootCause }, async root => {
      await expect(loadHeldOutDefinition(ID, true, root)).rejects.toThrow(/matches the example narrative/)
    })
  })
})
