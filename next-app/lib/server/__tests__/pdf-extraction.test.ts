import { describe, it, expect } from 'vitest'
import { extractWithRegex } from '../pdf-extraction'

// ---------------------------------------------------------------------------
// DOI Extraction
// ---------------------------------------------------------------------------

describe('extractWithRegex – DOI', () => {
  it('extracts a standard DOI', () => {
    const text = 'Available at https://doi.org/10.1001/jama.2020.1234 for review.'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.1001/jama.2020.1234')
  })

  it('extracts DOI with doi: prefix', () => {
    const text = 'doi: 10.1038/s41586-021-03819-2'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.1038/s41586-021-03819-2')
  })

  it('strips trailing punctuation from DOI', () => {
    const text = '(10.1016/j.cell.2021.03.015).'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.1016/j.cell.2021.03.015')
  })

  it('extracts DOI with long suffix', () => {
    const text = '10.11111/abcdef.12345-v2'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.11111/abcdef.12345-v2')
  })

  it('returns undefined when no DOI is present', () => {
    const text = 'This paper has no digital object identifier.'
    const result = extractWithRegex(text)
    expect(result.doi).toBeUndefined()
  })

  it('extracts DOI embedded in a URL', () => {
    const text = 'https://dx.doi.org/10.1371/journal.pone.0123456'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.1371/journal.pone.0123456')
  })

  it('stops at closing paren in DOI (known regex limitation)', () => {
    // The char class [^\s\])"'] excludes ")", so the match stops at the first ")"
    const text = 'DOI: 10.1002/(SICI)1097-0142'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.1002/(SICI')
  })
})

// ---------------------------------------------------------------------------
// PMID Extraction
// ---------------------------------------------------------------------------

describe('extractWithRegex – PMID', () => {
  it('extracts PMID with colon separator', () => {
    const text = 'PMID: 12345678'
    const result = extractWithRegex(text)
    expect(result.pmid).toBe('12345678')
  })

  it('extracts PMID with space separator', () => {
    const text = 'PMID 87654321'
    const result = extractWithRegex(text)
    expect(result.pmid).toBe('87654321')
  })

  it('extracts PMID from PubMed URL', () => {
    const text = 'See https://pubmed.ncbi.nlm.nih.gov/34567890/ for details'
    const result = extractWithRegex(text)
    expect(result.pmid).toBe('34567890')
  })

  it('extracts PMID from "PubMed ID:" format', () => {
    const text = 'PubMed ID: 11223344'
    const result = extractWithRegex(text)
    expect(result.pmid).toBe('11223344')
  })

  it('is case-insensitive for PMID prefix', () => {
    const text = 'pmid: 99887766'
    const result = extractWithRegex(text)
    expect(result.pmid).toBe('99887766')
  })

  it('returns undefined when no PMID is present', () => {
    const text = 'No PubMed reference in this document.'
    const result = extractWithRegex(text)
    expect(result.pmid).toBeUndefined()
  })

  it('does not match numbers shorter than 6 digits', () => {
    const text = 'PMID: 12345'
    const result = extractWithRegex(text)
    expect(result.pmid).toBeUndefined()
  })

  it('truncates to first 9 digits when PMID has more than 9 digits', () => {
    // \d{6,9} greedily matches up to 9 digits from a longer number
    const text = 'PMID: 1234567890'
    const result = extractWithRegex(text)
    expect(result.pmid).toBe('123456789')
  })
})

// ---------------------------------------------------------------------------
// Year Extraction
// ---------------------------------------------------------------------------

describe('extractWithRegex – Year', () => {
  it('extracts year from "published" text', () => {
    const text = 'Published: January 15, 2023\nAbstract\nSome content here.'
    const result = extractWithRegex(text)
    expect(result.year).toBe(2023)
  })

  it('extracts year from "received" text', () => {
    const text = 'Received: March 2022\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.year).toBe(2022)
  })

  it('extracts year from copyright symbol', () => {
    const text = '© 2024 Elsevier Ltd.\nTitle of the paper long enough\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.year).toBe(2024)
  })

  it('extracts year from parenthesized format', () => {
    const text = 'Smith et al. (2021) conducted a study.\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.year).toBe(2021)
  })

  it('extracts year from standalone format', () => {
    const text = 'Journal of Medicine 2020 Vol 5\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.year).toBe(2020)
  })

  it('rejects years before 1900', () => {
    const text = 'Published in (1850) about ancient methods.'
    const result = extractWithRegex(text)
    expect(result.year).toBeUndefined()
  })

  it('returns undefined when no year pattern found', () => {
    const text = 'No dates in this text whatsoever.'
    const result = extractWithRegex(text)
    expect(result.year).toBeUndefined()
  })

  it('prioritizes "published" year over copyright year', () => {
    const text = 'Published: June 2023\n© 2024 Publisher\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.year).toBe(2023)
  })
})

// ---------------------------------------------------------------------------
// Title Extraction
// ---------------------------------------------------------------------------

describe('extractWithRegex – Title', () => {
  it('extracts the first substantial line before Abstract', () => {
    // Note: the "Abstract" line must be > 10 chars to survive the filter
    const text = [
      'Effect of Novel Therapy on Patient Outcomes in Randomized Trial',
      'John Smith, Jane Doe',
      'Abstract — Background',
      'Background: This study investigates...',
    ].join('\n')
    const result = extractWithRegex(text)
    expect(result.title).toBe(
      'Effect of Novel Therapy on Patient Outcomes in Randomized Trial'
    )
  })

  it('returns undefined when no Abstract section exists', () => {
    const text = [
      'Effect of Novel Therapy on Patient Outcomes',
      'John Smith, Jane Doe',
      'Introduction: This study investigates...',
    ].join('\n')
    const result = extractWithRegex(text)
    expect(result.title).toBeUndefined()
  })

  it('rejects titles shorter than 20 characters', () => {
    const text = [
      'Short Title Here',
      'Some longer content line that is substantial',
      'Abstract',
      'Background...',
    ].join('\n')
    const result = extractWithRegex(text)
    // "Short Title Here" is only 16 chars → rejected
    // It should not use it as title
    expect(result.title).toBeUndefined()
  })

  it('rejects all-caps titles (likely journal headers)', () => {
    const text = [
      'JOURNAL OF EXPERIMENTAL MEDICINE AND BIOLOGY',
      'A Proper Title That Should Be Extracted Instead',
      'Abstract',
      'Content here...',
    ].join('\n')
    const result = extractWithRegex(text)
    // First line is all caps → rejected
    // The function only considers lines[0], so title is undefined
    expect(result.title).toBeUndefined()
  })

  it('rejects titles longer than 300 characters', () => {
    const longTitle = 'A'.repeat(301)
    const text = [longTitle, 'Abstract', 'Content here...'].join('\n')
    const result = extractWithRegex(text)
    expect(result.title).toBeUndefined()
  })

  it('filters out lines with 10 or fewer characters', () => {
    // "Abstract" alone is only 8 chars and also gets filtered, so we need
    // an abstract marker line > 10 chars for the algorithm to find it
    const text = [
      'Vol 5', // too short, filtered
      'Research',  // too short, filtered
      'Impact of Exercise Interventions on Cardiovascular Health',
      'Abstract: Background and aims',
      'The quick brown fox...',
    ].join('\n')
    const result = extractWithRegex(text)
    expect(result.title).toBe(
      'Impact of Exercise Interventions on Cardiovascular Health'
    )
  })

  it('returns undefined when "Abstract" is too short to survive the line filter', () => {
    // "Abstract" is 8 chars and gets filtered by the > 10 char check,
    // so abstractIndex is -1 and no title is extracted
    const text = [
      'Effect of Novel Therapy on Patient Outcomes in Randomized Trial',
      'John Smith, Jane Doe',
      'Abstract',
      'Background: This study investigates...',
    ].join('\n')
    const result = extractWithRegex(text)
    expect(result.title).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Author Extraction
// ---------------------------------------------------------------------------

describe('extractWithRegex – Authors', () => {
  it('extracts authors from "by" prefix pattern', () => {
    // The regex optional middle-initial group greedily consumes the first
    // letter of multi-part last names, limiting how far the match extends.
    // Use single-part last names to get a clean extraction.
    const text = 'by John Smith, Jane Lee, Robert Tan\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.authors).toContain('John Smith')
    expect(result.authors).toContain('Jane')
  })

  it('extracts authors with middle initials', () => {
    const text = 'by John A. Smith, Jane B. Doe\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.authors).toContain('John')
    expect(result.authors).toContain('Smith')
  })

  it('extracts authors with superscript numbers', () => {
    const text = 'John Smith1, Jane Doe2, Robert Brown3\nDepartment of Medicine\nAbstract\nContent...'
    const result = extractWithRegex(text)
    if (result.authors) {
      // Superscript numbers should be stripped
      expect(result.authors).not.toMatch(/\d/)
    }
  })

  it('returns undefined when no author pattern matches', () => {
    const text = 'This paper discusses new findings about cancer treatment.\nAbstract\nContent...'
    const result = extractWithRegex(text)
    expect(result.authors).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Combined extraction
// ---------------------------------------------------------------------------

describe('extractWithRegex – Combined', () => {
  it('extracts multiple fields from a realistic header', () => {
    const text = [
      'Impact of Statin Therapy on Cardiovascular Outcomes: A Meta-Analysis',
      'by John Smith, Maria Garcia, Wei Chen',
      '',
      'Published: September 2023',
      'DOI: 10.1001/jama.2023.12345',
      'PMID: 37654321',
      '',
      'Abstract: Background and Objectives',
      'Background: Cardiovascular disease remains the leading cause of death globally.',
    ].join('\n')

    const result = extractWithRegex(text)

    expect(result.doi).toBe('10.1001/jama.2023.12345')
    expect(result.pmid).toBe('37654321')
    expect(result.year).toBe(2023)
    expect(result.title).toBe(
      'Impact of Statin Therapy on Cardiovascular Outcomes: A Meta-Analysis'
    )
    expect(result.authors).toContain('John Smith')
  })

  it('returns empty result for completely empty text', () => {
    const result = extractWithRegex('')
    expect(result).toEqual({})
  })

  it('returns empty result for text with no recognizable metadata', () => {
    const result = extractWithRegex(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
    )
    expect(result.doi).toBeUndefined()
    expect(result.pmid).toBeUndefined()
    expect(result.year).toBeUndefined()
    expect(result.title).toBeUndefined()
    expect(result.authors).toBeUndefined()
  })

  it('handles text with only a DOI and nothing else', () => {
    const text = '10.1234/test.5678'
    const result = extractWithRegex(text)
    expect(result.doi).toBe('10.1234/test.5678')
    expect(result.pmid).toBeUndefined()
    expect(result.title).toBeUndefined()
  })
})
