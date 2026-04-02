import { describe, it, expect } from 'vitest'
import { normalizeStudy } from '../../utils/normalize'

describe('normalizeStudy', () => {
  const currentYear = new Date().getFullYear()
  const asStudyInput = (input: unknown) => input as Parameters<typeof normalizeStudy>[0]

  it('passes through valid data unchanged', () => {
    const input = {
      title: 'Valid Title',
      authors: 'John Doe',
      year: 2020,
      status: 'extracted' as const,
      quality: 'High' as const,
      details: { abstract: 'Test abstract' },
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result).toEqual({
      id: undefined,
      title: 'Valid Title',
      authors: 'John Doe',
      year: 2020,
      status: 'extracted',
      quality: 'High',
      details: { abstract: 'Test abstract' },
    })
  })

  it('trims whitespace from title', () => {
    const input = {
      title: '  Padded Title  ',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.title).toBe('Padded Title')
  })

  it('trims whitespace from authors', () => {
    const input = {
      title: 'Title',
      authors: '  John Doe, Jane Smith  ',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.authors).toBe('John Doe, Jane Smith')
  })

  it('defaults title to "Untitled Study" when empty', () => {
    const input = {
      title: '',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.title).toBe('Untitled Study')
  })

  it('defaults title to "Untitled Study" when only whitespace', () => {
    const input = {
      title: '   ',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.title).toBe('Untitled Study')
  })

  it('defaults authors to "Unknown" when empty', () => {
    const input = {
      title: 'Title',
      authors: '',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.authors).toBe('Unknown')
  })

  it('defaults authors to "Unknown" when only whitespace', () => {
    const input = {
      title: 'Title',
      authors: '   ',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.authors).toBe('Unknown')
  })

  it('defaults year to current year when not a number', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 'invalid' as unknown as number,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.year).toBe(currentYear)
  })

  it('defaults year to current year when NaN', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: NaN,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.year).toBe(currentYear)
  })

  it('defaults year to current year when Infinity', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: Infinity,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.year).toBe(currentYear)
  })

  it('accepts valid year values', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 1999,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.year).toBe(1999)
  })

  it('defaults status to "pending" when empty', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 2020,
      status: '' as unknown as string,
      quality: '-' as const,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.status).toBe('pending')
  })

  it('defaults quality to "-" when empty', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '' as unknown as string,
    }

    const result = normalizeStudy(asStudyInput(input))

    expect(result.quality).toBe('-')
  })

  it('preserves id when provided', () => {
    const input = {
      id: 'study-123',
      title: 'Title',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(input)

    expect(result.id).toBe('study-123')
  })

  it('sets id to undefined when not provided', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(input)

    expect(result.id).toBeUndefined()
  })

  it('preserves details when provided', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
      details: {
        abstract: 'Test abstract',
        doi: '10.1234/test',
        keywords: ['test', 'study'],
      },
    }

    const result = normalizeStudy(input)

    expect(result.details).toEqual({
      abstract: 'Test abstract',
      doi: '10.1234/test',
      keywords: ['test', 'study'],
    })
  })

  it('sets details to undefined when not provided', () => {
    const input = {
      title: 'Title',
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(input)

    expect(result.details).toBeUndefined()
  })

  it('handles null-ish title gracefully', () => {
    const input = {
      title: null as unknown as string,
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(input)

    expect(result.title).toBe('Untitled Study')
  })

  it('handles undefined title gracefully', () => {
    const input = {
      title: undefined as unknown as string,
      authors: 'Author',
      year: 2020,
      status: 'pending' as const,
      quality: '-' as const,
    }

    const result = normalizeStudy(input)

    expect(result.title).toBe('Untitled Study')
  })
})
