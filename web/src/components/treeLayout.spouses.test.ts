import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CARD_H,
  CARD_W,
  SPOUSE_GAP,
  buildFamilyCombs,
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

  it('keeps spouses on one generation when ancestor depths differ', () => {
    const nodes: IndividualNode[] = [
      { id: 'a1', firstName: 'A1' },
      { id: 'husband', firstName: 'Igor', lastName: 'Grechko' },
      { id: 'b0', firstName: 'B0' },
      { id: 'b1', firstName: 'B1' },
      { id: 'wife', firstName: 'Lubov', lastName: 'Grechko' },
      { id: 'child', firstName: 'Child' },
    ]
    const relationships: TreeRelationship[] = [
      {
        source: 'a1',
        target: 'husband',
        type: 'PARENT_CHILD',
        familyId: 'fa',
      },
      {
        source: 'b0',
        target: 'b1',
        type: 'PARENT_CHILD',
        familyId: 'fb0',
      },
      {
        source: 'b1',
        target: 'wife',
        type: 'PARENT_CHILD',
        familyId: 'fb1',
      },
      {
        source: 'husband',
        target: 'wife',
        type: 'SPOUSE',
        familyId: 'fam',
      },
      {
        source: 'husband',
        target: 'child',
        type: 'PARENT_CHILD',
        familyId: 'fam',
      },
      {
        source: 'wife',
        target: 'child',
        type: 'PARENT_CHILD',
        familyId: 'fam',
      },
    ]

    const laidOut = layoutNodes(nodes, relationships)
    const husband = laidOut.find((node) => node.id === 'husband')
    const wife = laidOut.find((node) => node.id === 'wife')
    const child = laidOut.find((node) => node.id === 'child')

    assert.ok(husband)
    assert.ok(wife)
    assert.ok(child)
    assert.equal(husband.generation, wife.generation)
    assert.equal(Math.abs(husband.x - wife.x), CARD_W + SPOUSE_GAP)
    assert.ok(child.generation > husband.generation)
  })

  it('keeps family comb when orphan spouse is pulled to partner generation', () => {
    const nodes: IndividualNode[] = [
      { id: 'gp', firstName: 'GP' },
      { id: 'p', firstName: 'P' },
      { id: 'husband', firstName: 'Georgiy', lastName: 'Tkachenko' },
      { id: 'wife', firstName: 'Wife' },
      { id: 'child', firstName: 'Child' },
    ]
    const relationships: TreeRelationship[] = [
      {
        source: 'gp',
        target: 'p',
        type: 'PARENT_CHILD',
        familyId: 'f0',
      },
      {
        source: 'p',
        target: 'husband',
        type: 'PARENT_CHILD',
        familyId: 'f1',
      },
      {
        source: 'husband',
        target: 'wife',
        type: 'SPOUSE',
        familyId: 'fam',
      },
      {
        source: 'wife',
        target: 'child',
        type: 'PARENT_CHILD',
        familyId: 'fam',
      },
    ]

    const laidOut = layoutNodes(nodes, relationships)
    const pos = new Map(laidOut.map((node) => [node.id, node]))
    const husband = pos.get('husband')
    const wife = pos.get('wife')
    const child = pos.get('child')
    const combs = buildFamilyCombs(relationships, pos)

    assert.ok(husband)
    assert.ok(wife)
    assert.ok(child)
    assert.equal(husband.generation, wife.generation)
    assert.ok(child.generation > wife.generation)
    assert.ok(child.y > wife.y + CARD_H + 8)
    assert.ok(combs.some((comb) => comb.familyId === 'fam'))
  })
})
