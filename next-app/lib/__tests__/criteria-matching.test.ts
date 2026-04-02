import { describe, it, expect } from 'vitest'
import type { Study } from '@/types/ledger'
import type { ProtocolData } from '@/types/protocol'
import {
  matchesYearRange,
  matchesStudyDesign,
  getExclusionReasons,
  calculateEligibilityScore,
  evaluateCriteria,
  calculatePRISMACounts,
} from '../criteria-matching'

// ---------------------------------------------------------------------------
// Helpers – factory functions for minimal valid objects
// ---------------------------------------------------------------------------

function makeStudy(overrides: Partial<Study> = {}): Study {
  return {
    id: 'study-1',
    title: 'A Study',
    authors: 'Smith J',
    year: 2022,
    status: 'extracted',
    quality: '-',
    ...overrides,
  }
}

function makeProtocol(overrides: Partial<ProtocolData> = {}): ProtocolData {
  return {
    researchQuestion: '',
    pico: { population: '', intervention: '', comparison: '', outcome: '' },
    eligibility: { inclusion: [], exclusion: [] },
    searchStrategy: { query: '', databases: [] },
    methodology: {
      studyDesigns: [],
      timeFrameStart: '',
      timeFrameEnd: '',
      qualityAssessmentTool: '',
      qualityAssessmentNotes: '',
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// matchesYearRange
// ---------------------------------------------------------------------------

describe('matchesYearRange', () => {
  it('returns true when no time frame is set', () => {
    const study = makeStudy({ year: 1999 })
    const protocol = makeProtocol()
    expect(matchesYearRange(study, protocol)).toBe(true)
  })

  it('returns true when study year is within range', () => {
    const study = makeStudy({ year: 2020 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(study, protocol)).toBe(true)
  })

  it('returns true at exact start boundary', () => {
    const study = makeStudy({ year: 2015 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(study, protocol)).toBe(true)
  })

  it('returns true at exact end boundary', () => {
    const study = makeStudy({ year: 2025 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(study, protocol)).toBe(true)
  })

  it('returns false when study year is before start', () => {
    const study = makeStudy({ year: 2014 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(study, protocol)).toBe(false)
  })

  it('returns false when study year is after end', () => {
    const study = makeStudy({ year: 2026 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(study, protocol)).toBe(false)
  })

  it('works with only a start year (no end)', () => {
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2020',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(makeStudy({ year: 2019 }), protocol)).toBe(false)
    expect(matchesYearRange(makeStudy({ year: 2020 }), protocol)).toBe(true)
    expect(matchesYearRange(makeStudy({ year: 2030 }), protocol)).toBe(true)
  })

  it('works with only an end year (no start)', () => {
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '',
        timeFrameEnd: '2020',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesYearRange(makeStudy({ year: 1980 }), protocol)).toBe(true)
    expect(matchesYearRange(makeStudy({ year: 2020 }), protocol)).toBe(true)
    expect(matchesYearRange(makeStudy({ year: 2021 }), protocol)).toBe(false)
  })

  it('handles non-numeric time frame strings gracefully (treated as no constraint)', () => {
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: 'abc',
        timeFrameEnd: 'xyz',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    // parseInt("abc") → NaN, so the check is skipped → true
    expect(matchesYearRange(makeStudy({ year: 2000 }), protocol)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// matchesStudyDesign
// ---------------------------------------------------------------------------

describe('matchesStudyDesign', () => {
  it('returns true when no study designs are specified in protocol', () => {
    const study = makeStudy({ details: { studyType: 'Cohort' } })
    const protocol = makeProtocol()
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('returns false when study has no studyType and protocol requires designs', () => {
    const study = makeStudy({ details: {} })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(false)
  })

  it('returns false when study has no details at all', () => {
    const study = makeStudy()
    delete study.details
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(false)
  })

  it('matches RCT study type to "Randomized Controlled Trials (RCTs)"', () => {
    const study = makeStudy({ details: { studyType: 'RCT' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('matches Cohort to "Prospective Cohort Studies"', () => {
    const study = makeStudy({ details: { studyType: 'Cohort' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Prospective Cohort Studies'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('matches Cohort to "Retrospective Cohort Studies"', () => {
    const study = makeStudy({ details: { studyType: 'Cohort' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Retrospective Cohort Studies'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('matches Case-Control to "Case-Control Studies"', () => {
    const study = makeStudy({ details: { studyType: 'Case-Control' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Case-Control Studies'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('matches Cross-Sectional to "Cross-sectional Studies"', () => {
    const study = makeStudy({ details: { studyType: 'Cross-Sectional' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Cross-sectional Studies'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('matches Meta-Analysis to "Meta-analyses"', () => {
    const study = makeStudy({ details: { studyType: 'Meta-Analysis' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Meta-analyses'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('matches Systematic-Review to "Systematic Reviews"', () => {
    const study = makeStudy({ details: { studyType: 'Systematic-Review' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Systematic Reviews'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('does NOT match "Other" to any design (empty mapping)', () => {
    const study = makeStudy({ details: { studyType: 'Other' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)', 'Cohort'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(false)
  })

  it('matches when study type is in one of multiple protocol designs', () => {
    const study = makeStudy({ details: { studyType: 'Case-Report' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)', 'Case Reports'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })

  it('is case-insensitive', () => {
    const study = makeStudy({ details: { studyType: 'RCT' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['randomized controlled trials (rcts)'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(matchesStudyDesign(study, protocol)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getExclusionReasons
// ---------------------------------------------------------------------------

describe('getExclusionReasons', () => {
  it('returns empty array when study meets all criteria', () => {
    const study = makeStudy({ year: 2020, details: { studyType: 'RCT' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(getExclusionReasons(study, protocol)).toEqual([])
  })

  it('returns year reason with full range when both bounds set', () => {
    const study = makeStudy({ year: 2010 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const reasons = getExclusionReasons(study, protocol)
    expect(reasons).toContain('Published outside time frame (2015-2025)')
  })

  it('returns "before" reason when only start is set', () => {
    const study = makeStudy({ year: 2010 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const reasons = getExclusionReasons(study, protocol)
    expect(reasons).toContain('Published before 2015')
  })

  it('returns "after" reason when only end is set', () => {
    const study = makeStudy({ year: 2030 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const reasons = getExclusionReasons(study, protocol)
    expect(reasons).toContain('Published after 2025')
  })

  it('returns design mismatch reason', () => {
    const study = makeStudy({ year: 2020, details: { studyType: 'Case-Report' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const reasons = getExclusionReasons(study, protocol)
    expect(reasons).toContain('Study design (Case-Report) not in protocol criteria')
  })

  it('returns "Unknown" for study type when details missing', () => {
    const study = makeStudy({ year: 2020 })
    delete study.details
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '',
        timeFrameEnd: '',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const reasons = getExclusionReasons(study, protocol)
    expect(reasons).toContain('Study design (Unknown) not in protocol criteria')
  })

  it('can return multiple exclusion reasons simultaneously', () => {
    const study = makeStudy({ year: 2010, details: { studyType: 'Other' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const reasons = getExclusionReasons(study, protocol)
    expect(reasons).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// calculateEligibilityScore
// ---------------------------------------------------------------------------

describe('calculateEligibilityScore', () => {
  it('returns 100 when no criteria are set (vacuously eligible)', () => {
    const study = makeStudy()
    const protocol = makeProtocol()
    expect(calculateEligibilityScore(study, protocol)).toBe(100)
  })

  it('returns 100 when study passes all criteria', () => {
    const study = makeStudy({ year: 2020, details: { studyType: 'RCT' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(calculateEligibilityScore(study, protocol)).toBe(100)
  })

  it('returns 0 when study fails all criteria', () => {
    const study = makeStudy({ year: 2010, details: { studyType: 'Other' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(calculateEligibilityScore(study, protocol)).toBe(0)
  })

  it('returns 50 when study passes 1 of 2 criteria', () => {
    // Passes year, fails design
    const study = makeStudy({ year: 2020, details: { studyType: 'Other' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(calculateEligibilityScore(study, protocol)).toBe(50)
  })

  it('returns 100 when only year criteria is set and study passes', () => {
    const study = makeStudy({ year: 2020 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(calculateEligibilityScore(study, protocol)).toBe(100)
  })

  it('returns 0 when only year criteria is set and study fails', () => {
    const study = makeStudy({ year: 2010 })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: [],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    expect(calculateEligibilityScore(study, protocol)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// evaluateCriteria
// ---------------------------------------------------------------------------

describe('evaluateCriteria', () => {
  it('returns a complete result object', () => {
    const study = makeStudy({ year: 2020, details: { studyType: 'RCT' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const result = evaluateCriteria(study, protocol)
    expect(result).toEqual({
      matchesYearRange: true,
      matchesStudyDesign: true,
      eligibilityScore: 100,
      exclusionReasons: [],
      meetsAllCriteria: true,
    })
  })

  it('marks meetsAllCriteria false when any criterion fails', () => {
    const study = makeStudy({ year: 2010, details: { studyType: 'RCT' } })
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const result = evaluateCriteria(study, protocol)
    expect(result.meetsAllCriteria).toBe(false)
    expect(result.matchesYearRange).toBe(false)
    expect(result.matchesStudyDesign).toBe(true)
    expect(result.eligibilityScore).toBe(50)
    expect(result.exclusionReasons.length).toBeGreaterThan(0)
  })

  it('considers study eligible when protocol has no constraints', () => {
    const study = makeStudy()
    const protocol = makeProtocol()
    const result = evaluateCriteria(study, protocol)
    expect(result.meetsAllCriteria).toBe(true)
    expect(result.eligibilityScore).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// calculatePRISMACounts
// ---------------------------------------------------------------------------

describe('calculatePRISMACounts', () => {
  it('returns all zeros for empty study list', () => {
    const counts = calculatePRISMACounts([], makeProtocol())
    expect(counts).toEqual({
      recordsIdentified: 0,
      recordsAfterDuplicates: 0,
      recordsScreened: 0,
      recordsExcludedScreening: 0,
      fullTextAssessed: 0,
      fullTextExcluded: 0,
      includedQualitative: 0,
      includedQuantitative: 0,
      needsReview: 0,
      meetsCriteria: 0,
      failsCriteria: 0,
    })
  })

  it('counts triage decisions correctly', () => {
    const studies: Study[] = [
      makeStudy({ id: '1', details: { triageDecision: 'keep' } }),
      makeStudy({ id: '2', details: { triageDecision: 'keep' } }),
      makeStudy({ id: '3', details: { triageDecision: 'exclude' } }),
      makeStudy({ id: '4', details: { triageDecision: 'maybe' } }),
      makeStudy({ id: '5', details: {} }),
    ]
    const protocol = makeProtocol()
    const counts = calculatePRISMACounts(studies, protocol)

    expect(counts.recordsIdentified).toBe(5)
    expect(counts.recordsScreened).toBe(5)
    expect(counts.includedQualitative).toBe(2)
    expect(counts.recordsExcludedScreening).toBe(1)
    expect(counts.needsReview).toBe(1)
    expect(counts.fullTextAssessed).toBe(3) // keep(2) + maybe(1)
    expect(counts.fullTextExcluded).toBe(1) // excluded count
  })

  it('counts criteria matches correctly', () => {
    const protocol = makeProtocol({
      methodology: {
        studyDesigns: ['Randomized Controlled Trials (RCTs)'],
        timeFrameStart: '2015',
        timeFrameEnd: '2025',
        qualityAssessmentTool: '',
        qualityAssessmentNotes: '',
      },
    })
    const studies: Study[] = [
      makeStudy({ id: '1', year: 2020, details: { studyType: 'RCT' } }), // meets both
      makeStudy({ id: '2', year: 2010, details: { studyType: 'RCT' } }), // fails year
      makeStudy({ id: '3', year: 2020, details: { studyType: 'Other' } }), // fails design
    ]
    const counts = calculatePRISMACounts(studies, protocol)
    expect(counts.meetsCriteria).toBe(1)
    expect(counts.failsCriteria).toBe(2)
  })

  it('sets recordsAfterDuplicates equal to recordsIdentified', () => {
    const studies = [makeStudy(), makeStudy({ id: '2' })]
    const counts = calculatePRISMACounts(studies, makeProtocol())
    expect(counts.recordsAfterDuplicates).toBe(counts.recordsIdentified)
  })

  it('always sets includedQuantitative to 0', () => {
    const studies = [
      makeStudy({ details: { triageDecision: 'keep' } }),
    ]
    const counts = calculatePRISMACounts(studies, makeProtocol())
    expect(counts.includedQuantitative).toBe(0)
  })
})
