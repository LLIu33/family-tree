import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectSurnames,
  isSurnameMismatch,
  nodeHighlightFlags,
  normalizeSurname,
} from './treeHighlight.ts'

describe('normalizeSurname', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeSurname('  Иванов '), 'иванов')
  })
})

describe('collectSurnames', () => {
  it('dedupes case-insensitively and skips blank/unknown', () => {
    assert.deepEqual(
      collectSurnames([
        { lastName: 'Иванов' },
        { lastName: 'иванов' },
        { lastName: ' ' },
        { lastName: 'unknown' },
        { lastName: 'Петров' },
      ]),
      ['Иванов', 'Петров'],
    )
  })
})

describe('nodeHighlightFlags', () => {
  it('keeps other surnames dim even when in focus related set', () => {
    const flags = nodeHighlightFlags({
      surnameMismatch: true,
      focusActive: true,
      inRelated: true,
    })
    assert.equal(flags.isDim, true)
    assert.equal(flags.isHot, false)
  })

  it('hots matching surname nodes that are in focus related set', () => {
    const flags = nodeHighlightFlags({
      surnameMismatch: false,
      focusActive: true,
      inRelated: true,
    })
    assert.equal(flags.isDim, false)
    assert.equal(flags.isHot, true)
  })

  it('dims non-related when focus is active and surname matches', () => {
    const flags = nodeHighlightFlags({
      surnameMismatch: false,
      focusActive: true,
      inRelated: false,
    })
    assert.equal(flags.isDim, true)
    assert.equal(flags.isHot, false)
  })
})

describe('isSurnameMismatch', () => {
  it('is false when filter cleared', () => {
    assert.equal(isSurnameMismatch('Иванов', null), false)
  })
  it('is true for other surnames when filter set', () => {
    assert.equal(isSurnameMismatch('Петров', 'Иванов'), true)
  })
})
