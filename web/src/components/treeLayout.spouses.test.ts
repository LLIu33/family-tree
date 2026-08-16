import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CARD_W,
  SPOUSE_GAP,
  buildSpouseBlocks,
  layoutNodes,
  orderIdsWithSpouseBlocks,
  packBlocks,
} from './treeLayout.ts'
import type { IndividualNode, TreeRelationship } from '../api.ts'

function spouses(pairs: Array<[string, string]>): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const [a, b] of pairs) {
    if (!m.has(a)) m.set(a, [])
    if (!m.has(b)) m.set(b, [])
    if (!m.get(a)!.includes(b)) m.get(a)!.push(b)
    if (!m.get(b)!.includes(a)) m.get(b)!.push(a)
  }
  return m
}

describe('buildSpouseBlocks', () => {
  it('keeps a married pair in one contiguous block even if listed apart', () => {
    const sp = spouses([['h', 'w']])
    const blocks = buildSpouseBlocks(['h', 'x', 'w'], sp)
    assert.deepEqual(blocks, [['h', 'w'], ['x']])
  })

  it('chains multiple spouses of one person into one block', () => {
    const sp = spouses([
      ['a', 'b'],
      ['a', 'c'],
    ])
    const blocks = buildSpouseBlocks(['b', 'z', 'a', 'c'], sp)
    assert.equal(blocks.length, 2)
    assert.deepEqual(new Set(blocks[0]), new Set(['a', 'b', 'c']))
    assert.deepEqual(blocks[1], ['z'])
    const flat = orderIdsWithSpouseBlocks(['b', 'z', 'a', 'c'], sp)
    const iA = flat.indexOf('a')
    const iB = flat.indexOf('b')
    const iC = flat.indexOf('c')
    const iZ = flat.indexOf('z')
    assert.ok(Math.max(iA, iB, iC) - Math.min(iA, iB, iC) === 2)
    assert.ok(iZ === 0 || iZ === 3)
  })

  it('orders multi-spouse chains by spouse links inside the component', () => {
    const sp = spouses([
      ['a', 'b'],
      ['a', 'c'],
    ])
    const blocks = buildSpouseBlocks(['b', 'c', 'a'], sp)
    assert.deepEqual(blocks, [['b', 'a', 'c']])
  })
})

describe('packBlocks', () => {
  it('places spouses with SPOUSE_GAP and does not insert a gap between them', () => {
    const sp = spouses([['h', 'w']])
    const blocks = buildSpouseBlocks(['h', 'w'], sp)
    const xHint = new Map([
      ['h', 100],
      ['w', 800],
    ])
    const xPos = packBlocks(blocks, xHint, sp)
    const gap = Math.abs(xPos.get('w')! - xPos.get('h')!)
    assert.equal(gap, CARD_W + SPOUSE_GAP)
  })
})

describe('layoutNodes', () => {
  it('places spouses with shared children at SPOUSE_GAP on the same generation', () => {
    const nodes: IndividualNode[] = [
      { id: 'husband', firstName: 'Husband' },
      { id: 'wife', firstName: 'Wife' },
      { id: 'child1', firstName: 'Child 1' },
      { id: 'child2', firstName: 'Child 2' },
    ]
    const relationships: TreeRelationship[] = [
      {
        source: 'husband',
        target: 'wife',
        type: 'SPOUSE',
        familyId: 'family',
      },
      {
        source: 'husband',
        target: 'child1',
        type: 'PARENT_CHILD',
        familyId: 'family',
      },
      {
        source: 'wife',
        target: 'child1',
        type: 'PARENT_CHILD',
        familyId: 'family',
      },
      {
        source: 'husband',
        target: 'child2',
        type: 'PARENT_CHILD',
        familyId: 'family',
      },
      {
        source: 'wife',
        target: 'child2',
        type: 'PARENT_CHILD',
        familyId: 'family',
      },
    ]

    const laidOut = layoutNodes(nodes, relationships)
    const husband = laidOut.find((node) => node.id === 'husband')
    const wife = laidOut.find((node) => node.id === 'wife')

    assert.ok(husband)
    assert.ok(wife)
    assert.equal(husband.generation, wife.generation)
    assert.equal(Math.abs(husband.x - wife.x), CARD_W + SPOUSE_GAP)
  })
})
