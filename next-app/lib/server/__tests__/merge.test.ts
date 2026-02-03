import { describe, it, expect } from 'vitest'
import { mergeDetails } from '../../utils/merge'

describe('mergeDetails', () => {
  it('preserves existing top-level fields not in update', () => {
    const existing = { foo: 'bar', baz: 123 }
    const incoming = { qux: 'new' }
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({ foo: 'bar', baz: 123, qux: 'new' })
  })

  it('overwrites top-level fields that are in update', () => {
    const existing = { foo: 'old', baz: 123 }
    const incoming = { foo: 'new' }
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({ foo: 'new', baz: 123 })
  })

  it('preserves nested fields when sibling is updated', () => {
    const existing = {
      pico: { population: 'Adults', intervention: 'Drug A' },
    }
    const incoming = {
      pico: { outcome: 'Mortality' },
    }
    const result = mergeDetails(existing, incoming)

    // This was the bug - shallow merge would lose population & intervention
    expect(result).toEqual({
      pico: {
        population: 'Adults',
        intervention: 'Drug A',
        outcome: 'Mortality',
      },
    })
  })

  it('deeply nested objects are merged', () => {
    const existing = {
      meta: {
        extraction: {
          confidence: 0.9,
          source: 'ai',
        },
      },
    }
    const incoming = {
      meta: {
        extraction: {
          timestamp: '2025-01-01',
        },
      },
    }
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({
      meta: {
        extraction: {
          confidence: 0.9,
          source: 'ai',
          timestamp: '2025-01-01',
        },
      },
    })
  })

  it('handles null incoming values (overwrites)', () => {
    const existing = { foo: 'bar' }
    const incoming = { foo: null }
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({ foo: null })
  })

  it('handles empty existing details', () => {
    const existing = {}
    const incoming = { foo: 'bar', nested: { a: 1 } }
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({ foo: 'bar', nested: { a: 1 } })
  })

  it('handles empty incoming details', () => {
    const existing = { foo: 'bar', nested: { a: 1 } }
    const incoming = {}
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({ foo: 'bar', nested: { a: 1 } })
  })

  it('arrays are replaced, not merged', () => {
    const existing = { tags: ['a', 'b'] }
    const incoming = { tags: ['c', 'd'] }
    const result = mergeDetails(existing, incoming)

    // Arrays should be replaced entirely, not concatenated
    expect(result).toEqual({ tags: ['c', 'd'] })
  })

  it('handles triageDecision update without losing other fields', () => {
    const existing = {
      studyType: 'RCT',
      abstract: 'Some abstract text',
      triageDecision: null,
    }
    const incoming = {
      triageDecision: 'keep',
      triageDate: '2025-01-15T10:00:00Z',
    }
    const result = mergeDetails(existing, incoming)

    expect(result).toEqual({
      studyType: 'RCT',
      abstract: 'Some abstract text',
      triageDecision: 'keep',
      triageDate: '2025-01-15T10:00:00Z',
    })
  })
})
