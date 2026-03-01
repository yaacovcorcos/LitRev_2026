import "server-only";

import type { DraftState } from "@/lib/draftStorage";
import { createDefaultDraftState } from "@/lib/draftStorage";
import { prisma } from "@/lib/server/prisma";
import { getProject } from "@/lib/server/projects";
import { requireScope, type ServiceScope, type ScopeInput } from "@/lib/server/scope";
import { DEMO_PROJECT_DESCRIPTION, DEMO_PROJECT_ID, DEMO_PROJECT_NAME, DEMO_PROJECT_PAPERS, DEMO_PROJECT_STATUS_TEXT } from "@/lib/demo/constants";
import type { Project } from "@/types/project";
import type { ProtocolData } from "@/types/protocol";
import type { Study, StudyDetails } from "@/types/ledger";
import type { JSONContent } from "@tiptap/core";
import { Prisma } from "@prisma/client";

/** Type-safe cast for app types -> Prisma Json fields. */
function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

type DemoStudySeed = {
  id: string;
  title: string;
  authors: string;
  year: number;
  status: Study["status"];
  quality: Study["quality"];
  details: StudyDetails;
};

const DEMO_CONVERSATION_ID = "demo-yoga-anxiety-welcome";

/* ---------------------------------------------------------------------------
 * PROTOCOL — enriched with PRISMA flow, per-database search, synthesis method
 * -------------------------------------------------------------------------*/

const DEMO_PROTOCOL: ProtocolData = {
  researchQuestion:
    "Does yoga reduce anxiety symptoms in adults compared to no treatment, waitlist, or active interventions?",
  pico: {
    population: "Adults (18+) with anxiety disorders (GAD, SAD, PD) or elevated anxiety symptoms on validated scales (STAI >= 40, BAI >= 16, HADS-A >= 8)",
    intervention: "Structured yoga interventions where asana, pranayama, or meditation is a core component (e.g., Hatha, Kundalini, Iyengar, Sudarshan Kriya Yoga). Minimum duration: 4 weeks of regular sessions.",
    comparison: "Waitlist/no treatment controls and active comparators (e.g., cognitive-behavioral therapy, progressive muscle relaxation, pharmacotherapy)",
    outcome: "Primary: anxiety symptom severity measured on validated instruments (STAI, BAI, HADS-A, HAM-A). Secondary: depressive symptoms (BDI, PHQ-9), quality of life (SF-36, WHOQOL), adverse events.",
  },
  eligibility: {
    inclusion: [
      "Randomized controlled trial (RCT) design with parallel or crossover groups",
      "Adult participants (>= 18 years of age)",
      "Yoga is a primary or stand-alone intervention arm (not embedded in a multi-component package where yoga cannot be isolated)",
      "Reports at least one validated anxiety outcome measure at post-intervention",
      "Published in a peer-reviewed journal, any language with English abstract",
    ],
    exclusion: [
      "Non-randomized, quasi-experimental, or single-arm designs",
      "Pediatric or adolescent-only populations (< 18 years)",
      "No validated anxiety-specific outcome measure reported",
      "Yoga used only as a brief induction (single session < 1 week)",
      "Conference abstracts, dissertations, or grey literature without peer review",
      "Duplicate reports of the same trial (retain most complete publication)",
    ],
  },
  searchStrategy: {
    query:
      'PubMed: ("yoga"[MeSH] OR yoga[tiab] OR "mind-body"[tiab]) AND ("anxiety"[MeSH] OR anxiety[tiab] OR "anxiety disorders"[tiab]) AND ("randomized controlled trial"[pt] OR randomized[tiab] OR randomised[tiab])\n\nPsycINFO: (DE "Yoga" OR TI yoga OR AB yoga) AND (DE "Anxiety" OR DE "Anxiety Disorders" OR TI anxiety OR AB anxiety) AND (TI randomized OR AB randomized OR TI trial OR AB trial)\n\nCENTRAL: (yoga OR "mind-body") AND (anxiety OR "anxiety disorder*") in Title Abstract Keyword\n\nScopus: TITLE-ABS-KEY(yoga AND anxiety AND (randomized OR randomised OR trial))\n\nIndMED: yoga AND anxiety AND trial\n\nSearch conducted through October 2016. No language or date restrictions applied.',
    databases: ["PubMed/MEDLINE", "PsycINFO", "Cochrane CENTRAL", "Scopus", "IndMED"],
  },
  methodology: {
    studyDesigns: ["Randomized Controlled Trials (RCTs)"],
    timeFrameStart: "1970",
    timeFrameEnd: "2016",
    qualityAssessmentTool: "Cochrane Risk of Bias (RoB 1.0)",
    qualityAssessmentNotes:
      "Two reviewers independently assess each included study across seven domains: (1) random sequence generation, (2) allocation concealment, (3) blinding of participants and personnel, (4) blinding of outcome assessment, (5) incomplete outcome data, (6) selective reporting, and (7) other bias. Each domain rated as low, high, or unclear risk. Disagreements resolved by consensus with a third reviewer.\n\nData synthesis: Random-effects meta-analysis (DerSimonian-Laird) using standardized mean differences (SMD, Hedges' g). Heterogeneity assessed via I-squared and Cochran's Q test. Subgroup analyses planned by: (a) comparator type (waitlist vs. active), (b) anxiety diagnosis method (DSM vs. self-report), (c) yoga style. Sensitivity analysis excluding high risk-of-bias studies. Publication bias evaluated by funnel plot inspection and Egger's regression test.\n\nPRISMA flow: 1,311 records identified -> 847 after deduplication -> 847 titles/abstracts screened -> 42 full texts assessed -> 8 RCTs included (n = 319 total participants).",
  },
};

/* ---------------------------------------------------------------------------
 * STUDIES — enriched with full bibliographic data, abstracts, criteria match
 * -------------------------------------------------------------------------*/

const DEMO_STUDIES: DemoStudySeed[] = [
  // ── Included studies (extracted) ──────────────────────────────────────
  {
    id: "demo-study-broota-1994",
    title: "Efficacy of two relaxation techniques in examination anxiety",
    authors: "Broota A, Sanghvi C",
    year: 1994,
    status: "extracted",
    quality: "Low",
    details: {
      journal: "Journal of Personality and Clinical Studies",
      volume: "10",
      issue: "1-2",
      pages: "29-35",
      studyType: "RCT",
      source: "manual",
      sampleSize: 30,
      keywords: ["yoga", "relaxation", "examination anxiety", "STAI"],
      abstract: "This study compared the effects of yoga-based relaxation and progressive muscle relaxation on examination anxiety in university students. Thirty participants with elevated state-trait anxiety inventory scores were randomly assigned to yoga relaxation (n=15) or progressive relaxation (n=15) for 6 weeks. Both groups showed significant reductions in state and trait anxiety, with the yoga group demonstrating marginally greater improvement on trait anxiety subscales.",
      triageDecision: "keep",
      triageNote: "Randomized trial with validated state and trait anxiety outcomes. Older study with limited reporting but meets all inclusion criteria.",
      aiSummary:
        "Small RCT comparing yoga-based relaxation vs. progressive muscle relaxation over 6 weeks. Both groups improved; yoga showed marginally greater trait anxiety reduction (STAI). Limited by small sample and older reporting standards.",
      qualityRationale: "Rated Low due to unclear randomization method, no allocation concealment described, no blinding, and limited statistical reporting. High attrition risk unclear from report.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 78,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-davis-2015",
    title: "Restorative yoga for women with breast cancer: findings from a randomized pilot study",
    authors: "Davis K, Goodman SH, Leiferman J, Taylor M, Dimidjian S",
    year: 2015,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.1016/j.ctcp.2015.06.005",
      pmid: "26256135",
      journal: "Complementary Therapies in Clinical Practice",
      volume: "21",
      issue: "3",
      pages: "139-144",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/26256135/",
      source: "manual",
      sampleSize: 44,
      keywords: ["restorative yoga", "breast cancer", "anxiety", "pilot RCT", "STAI"],
      abstract: "This pilot RCT evaluated the feasibility and preliminary efficacy of a 10-week restorative yoga program for women who had completed treatment for breast cancer. Forty-four women were randomized to restorative yoga (n=23) or a waitlist control (n=21). The yoga group showed significant reductions in state anxiety (STAI-S, p=.03) and depressive symptoms compared with waitlist. Adherence was high (82% attendance), supporting feasibility.",
      triageDecision: "keep",
      triageNote: "Randomized pilot design with validated anxiety outcome (STAI). Cancer survivor population is acceptable as anxiety was the measured outcome.",
      aiSummary:
        "Pilot RCT of 10-week restorative yoga vs. waitlist in 44 breast cancer survivors. Significant state anxiety reduction (STAI-S, p=.03). Good adherence (82%). Limited by pilot sample size and single-site design.",
      qualityRationale: "Rated Medium: adequate randomization (computer-generated), unblinded (inherent to yoga), moderate sample, pilot design limits generalizability. Low attrition. Clear outcome reporting.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 88,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-demanincor-2016",
    title:
      "Individualized yoga for reducing depression and anxiety, and improving well-being: a randomized controlled trial",
    authors: "de Manincor M, Bensoussan A, Smith CA, Barr K, Schweickle M, Donoghoe LL, Bourchier S, Fahey P",
    year: 2016,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.1002/da.22502",
      pmid: "27030303",
      journal: "Depression and Anxiety",
      volume: "33",
      issue: "9",
      pages: "816-828",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/27030303/",
      source: "manual",
      sampleSize: 101,
      keywords: ["individualized yoga", "depression", "anxiety", "well-being", "DASS-21"],
      abstract: "This RCT evaluated individualized yoga therapy for adults with depression and/or anxiety. One hundred and one participants were randomized to 6 weeks of individualized yoga (n=52) or waitlist (n=49). The yoga group showed significant improvements in depression (DASS-21, p<.001), anxiety (DASS-21, p=.02), and well-being compared with controls. Effects were maintained at 6-week follow-up.",
      triageDecision: "keep",
      triageNote: "Full-scale RCT with validated anxiety outcome (DASS-21 anxiety subscale). Individualized yoga approach well-described.",
      aiSummary:
        "RCT of 6-week individualized yoga vs. waitlist in 101 adults with depression/anxiety. Significant anxiety reduction (DASS-21, p=.02) with effects maintained at follow-up. Largest sample among included studies.",
      qualityRationale: "Rated Medium: adequate randomization, reasonable sample size (n=101), validated outcomes, but no blinding and waitlist-only comparison. Well-reported methodology.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 92,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-gupta-2006",
    title: "Effect of yoga based lifestyle intervention on state and trait anxiety",
    authors: "Gupta N, Khera S, Vempati RP, Sharma R, Bijlani RL",
    year: 2006,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.4103/0019-5545.31597",
      pmid: "20058538",
      journal: "Indian Journal of Physiology and Pharmacology",
      volume: "50",
      issue: "1",
      pages: "41-47",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/20058538/",
      source: "manual",
      sampleSize: 62,
      keywords: ["yoga lifestyle", "state anxiety", "trait anxiety", "STAI", "lifestyle intervention"],
      abstract: "Sixty-two adults with elevated anxiety were randomized to a comprehensive yoga-based lifestyle intervention (asana, pranayama, meditation, and lectures on stress management; n=31) or a waitlist control (n=31) for 10 days. Significant reductions were observed in both state anxiety (STAI-S, p<.001) and trait anxiety (STAI-T, p<.05) in the yoga group compared with controls.",
      triageDecision: "keep",
      triageNote: "Randomized assignment and clear anxiety outcomes (STAI) fit protocol criteria. Short intervention duration (10 days) noted but exceeds single-session threshold.",
      aiSummary:
        "RCT of 10-day intensive yoga lifestyle program (asana + pranayama + meditation) vs. waitlist in 62 adults. Significant reductions in both state (p<.001) and trait (p<.05) anxiety on STAI.",
      qualityRationale: "Rated Medium: randomized, adequate sample, validated outcomes (STAI), but short intervention duration (10 days), no blinding, and limited follow-up data.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 85,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-javnbakht-2009",
    title: "Effects of yoga on depression and anxiety of women",
    authors: "Javnbakht M, Hejazi Kenari R, Ghasemi M",
    year: 2009,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.1016/j.ctcp.2009.03.003",
      pmid: "19632979",
      journal: "Complementary Therapies in Clinical Practice",
      volume: "15",
      issue: "2",
      pages: "102-104",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/19632979/",
      source: "manual",
      sampleSize: 65,
      keywords: ["yoga", "depression", "anxiety", "women", "BAI", "BDI"],
      abstract: "This RCT evaluated the effects of regular Hatha yoga practice on depression and anxiety in women. Sixty-five women were randomized to twice-weekly yoga sessions (n=34) or a waitlist control (n=31) for 2 months. The yoga group showed significantly greater reductions in anxiety (BAI, p<.05) and depression (BDI, p<.05) compared with controls at post-intervention.",
      triageDecision: "keep",
      triageNote: "RCT with validated anxiety outcome (BAI). Women-only sample is acceptable per protocol (adults >= 18).",
      aiSummary:
        "RCT of 2-month Hatha yoga (twice weekly) vs. waitlist in 65 women. Significant anxiety reduction on BAI (p<.05). Simple design with clear results. Limited by brief report format.",
      qualityRationale: "Rated Medium: randomized, adequate sample, validated instruments (BAI, BDI), but short report with limited methodological detail. No blinding, waitlist-only comparison.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 86,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-khalsa-2006",
    title: "Yoga ameliorates performance anxiety and mood disturbance in young professional musicians",
    authors: "Khalsa SBS, Cope S",
    year: 2006,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.1016/j.amjms.2006.05.065",
      pmid: "17220622",
      journal: "Applied Psychophysiology and Biofeedback",
      volume: "31",
      issue: "4",
      pages: "279-293",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/17220622/",
      source: "manual",
      sampleSize: 30,
      keywords: ["Kundalini yoga", "performance anxiety", "musicians", "STAI", "POMS"],
      abstract: "Young professional musicians (n=30) with performance anxiety were randomized to 8 weeks of Kundalini yoga (meditation, breathing, postures; n=15) or a no-treatment control (n=15). The yoga group reported significantly less performance anxiety and general anxiety (STAI) and improved mood (POMS) at follow-up compared with the control group.",
      triageDecision: "keep",
      triageNote: "RCT with validated anxiety outcomes (STAI, POMS). Performance anxiety is a recognized anxiety subtype. Adult population.",
      aiSummary:
        "RCT of 8-week Kundalini yoga vs. no treatment in 30 young musicians with performance anxiety. Significant reductions in general and performance anxiety (STAI) and improved mood (POMS).",
      qualityRationale: "Rated Medium: randomized, 8-week duration, validated outcomes, but small sample (n=30), no blinding, and specialized population (musicians) limits generalizability.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 84,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-norton-1983",
    title: "A comparison of two relaxation procedures for reducing cognitive and somatic anxiety",
    authors: "Norton GR, Johnson WE",
    year: 1983,
    status: "extracted",
    quality: "Low",
    details: {
      doi: "10.1016/0005-7916(83)90050-2",
      journal: "Journal of Behavior Therapy and Experimental Psychiatry",
      volume: "14",
      issue: "3",
      pages: "209-214",
      studyType: "RCT",
      sourceUrl: "https://doi.org/10.1016/0005-7916(83)90050-2",
      source: "manual",
      sampleSize: 36,
      keywords: ["relaxation", "yoga breathing", "cognitive anxiety", "somatic anxiety", "CSAQ"],
      abstract: "Thirty-six anxiety-prone adults were randomly assigned to yoga-based breathing/relaxation, progressive muscle relaxation, or no-treatment control for 4 weeks. Both active groups showed significant reductions in somatic anxiety; the yoga group additionally showed greater reductions in cognitive anxiety on the Cognitive-Somatic Anxiety Questionnaire (CSAQ).",
      triageDecision: "keep",
      triageNote: "Randomized controlled comparison with yoga-based breathing as an active arm. Anxiety-prone adult sample meets inclusion criteria.",
      aiSummary:
        "RCT comparing yoga breathing, progressive relaxation, and no treatment in 36 anxiety-prone adults over 4 weeks. Yoga group showed greater cognitive anxiety reduction (CSAQ). Both active groups reduced somatic anxiety.",
      qualityRationale: "Rated Low: early-1980s methodology, no allocation concealment, no blinding, small sample, limited reporting of randomization procedure and effect sizes.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 74,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-sahasi-1989",
    title: "Efficacy of yogic techniques in the treatment of anxiety neurosis",
    authors: "Sahasi G, Mohan D, Kacker C",
    year: 1989,
    status: "extracted",
    quality: "Low",
    details: {
      pmid: "21927407",
      journal: "Indian Journal of Psychiatry",
      volume: "31",
      issue: "2",
      pages: "147-152",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21927407/",
      source: "manual",
      sampleSize: 45,
      keywords: ["yogic techniques", "anxiety neurosis", "HAM-A", "psychiatry"],
      abstract: "Forty-five patients diagnosed with anxiety neurosis were randomly assigned to yoga therapy, diazepam, or a placebo control for 3 months. The yoga group showed significant reductions in Hamilton Anxiety Rating Scale (HAM-A) scores comparable to diazepam and superior to placebo. Yoga was well tolerated with no adverse effects reported.",
      triageDecision: "keep",
      triageNote: "RCT with clinically diagnosed anxiety neurosis population and validated outcome (HAM-A). Active comparator (diazepam) adds value.",
      aiSummary:
        "RCT comparing yoga, diazepam, and placebo in 45 patients with anxiety neurosis over 3 months. Yoga matched diazepam on HAM-A reductions and outperformed placebo. No adverse effects in yoga arm.",
      qualityRationale: "Rated Low: diagnosed population and active comparator are strengths, but methodology reporting is limited (unclear randomization, no allocation concealment detail), and older publication standards.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 76,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },
  {
    id: "demo-study-vahia-1973",
    title: "Further experience with the therapy based upon concepts of Patanjali in the treatment of psychiatric disorders",
    authors: "Vahia NS, Doongaji DR, Jeste DV, Kapoor SN, Ardhapurkar I, Ravindranath S",
    year: 1973,
    status: "extracted",
    quality: "Low",
    details: {
      doi: "10.4103/0019-5545.33380",
      pmid: "21862121",
      journal: "Indian Journal of Psychiatry",
      volume: "15",
      issue: "1",
      pages: "32-37",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21862121/",
      source: "manual",
      sampleSize: 40,
      keywords: ["Patanjali", "psychophysiologic therapy", "psychiatric disorders", "anxiety", "yoga therapy"],
      abstract: "Forty patients with various anxiety and neurotic disorders were randomly assigned to yoga-based psychophysiologic therapy grounded in Patanjali's Ashtanga Yoga or a sham biofeedback control for 4-6 weeks. The yoga group showed significantly greater reductions in anxiety symptoms and overall psychiatric morbidity compared with the control group.",
      triageDecision: "keep",
      triageNote: "Pioneering randomized trial of yoga-based psychophysiologic therapy for anxiety. Despite being from 1973, meets inclusion criteria with randomized design and anxiety outcomes.",
      aiSummary:
        "Earliest included RCT (1973): yoga-based Patanjali therapy vs. sham biofeedback in 40 psychiatric patients over 4-6 weeks. Significant anxiety reduction in yoga group. Important historically as early evidence for yoga in mental health.",
      qualityRationale: "Rated Low: pioneering study but methodology reporting is minimal by modern standards. Unclear sequence generation, no CONSORT-style reporting, and mixed psychiatric population.",
      deepAnalysisComplete: true,
      verified: true,
      criteriaMatch: {
        matchesYearRange: true,
        matchesStudyDesign: true,
        eligibilityScore: 70,
        checkedAt: "2026-02-15T10:00:00Z",
      },
    },
  },

  // ── Excluded studies ──────────────────────────────────────────────────
  {
    id: "demo-study-kozasa-2008",
    title: "Evaluation of Siddha Samadhi yoga for anxiety and depression symptoms: a preliminary study",
    authors: "Kozasa EH, Santos RF, Rueda AD, Benedito-Silva AA, De Ornellas FL, Leite JR",
    year: 2008,
    status: "excluded",
    quality: "Low",
    details: {
      doi: "10.2466/PR0.103.1.271-274",
      journal: "Psychological Reports",
      volume: "103",
      issue: "1",
      pages: "271-274",
      studyType: "Other",
      sourceUrl: "https://doi.org/10.2466/PR0.103.1.271-274",
      source: "manual",
      sampleSize: 22,
      keywords: ["Siddha Samadhi yoga", "anxiety", "depression", "preliminary"],
      abstract: "Twenty-two healthy volunteers participated in a Siddha Samadhi yoga program. Anxiety and depression symptoms were measured pre- and post-intervention using the STAI and BDI. Significant reductions were observed in both anxiety and depression scores. However, the study lacked randomization and a control group.",
      triageDecision: "exclude",
      exclusionReason: "Non-randomized, uncontrolled study design (single-arm pre-post comparison without control group).",
      triageNote: "Preliminary non-randomized design; excluded by protocol eligibility criterion #1 (RCT design required).",
      aiSummary:
        "Single-arm pre-post study of Siddha Samadhi yoga in 22 volunteers. Showed anxiety reduction but excluded due to lack of randomization and control group.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
  {
    id: "demo-study-hagins-2013",
    title:
      "Effectiveness of yoga versus stretching in reducing anxiety and depression in sixth graders",
    authors: "Hagins M, Rundle A, Consedine NS, Khalsa SBS",
    year: 2013,
    status: "excluded",
    quality: "Medium",
    details: {
      doi: "10.1007/s12671-012-0153-6",
      pmid: "23275644",
      pmcid: "PMC3572691",
      journal: "Mindfulness",
      volume: "5",
      issue: "3",
      pages: "312-324",
      studyType: "RCT",
      sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3572691/",
      source: "manual",
      sampleSize: 121,
      keywords: ["yoga", "children", "sixth graders", "anxiety", "depression", "school-based"],
      abstract: "One hundred twenty-one sixth graders were cluster-randomized to yoga or stretching/physical education classes for 8 weeks. No significant between-group differences were found for anxiety, depression, or negative affect outcomes. The study demonstrated feasibility of school-based yoga but lacked efficacy evidence in this pediatric population.",
      triageDecision: "exclude",
      exclusionReason: "Pediatric population (sixth graders, ~11-12 years old) — outside protocol age criterion (adults >= 18 only).",
      triageNote: "Well-designed cluster RCT with large sample, but participants are school-age children. Excluded per protocol criterion #2.",
      aiSummary:
        "Cluster RCT of yoga vs. stretching in 121 sixth graders. No significant anxiety differences found. Excluded because pediatric population falls outside adult-only inclusion criterion.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
  {
    id: "demo-study-bower-2014",
    title: "Yoga reduces inflammatory signaling in fatigued breast cancer survivors: a randomized controlled trial",
    authors: "Bower JE, Crosswell AD, Stanton AL, Crespi CM, Winston D, Arevalo J, Ma J, Cole SW, Ganz PA",
    year: 2014,
    status: "excluded",
    quality: "High",
    details: {
      doi: "10.1016/j.psyneuen.2014.01.019",
      pmid: "24703167",
      pmcid: "PMC4060606",
      journal: "Psychoneuroendocrinology",
      volume: "43",
      pages: "20-29",
      studyType: "RCT",
      sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4060606/",
      source: "manual",
      sampleSize: 31,
      keywords: ["yoga", "breast cancer", "inflammation", "NF-kB", "fatigue", "cytokines"],
      abstract: "Thirty-one fatigued breast cancer survivors were randomized to 12 weeks of Iyengar yoga or a health education control. Primary outcomes were inflammatory markers (NF-kB, pro-inflammatory cytokines) and fatigue. While yoga reduced inflammatory signaling and fatigue, no validated anxiety-specific outcome measure was included as a primary or secondary endpoint.",
      triageDecision: "exclude",
      exclusionReason: "No validated anxiety-specific primary or secondary outcome measure was reported. Primary outcomes were inflammatory biomarkers and fatigue.",
      triageNote: "High-quality RCT with rigorous methodology, but outcomes focus on fatigue and inflammatory signaling rather than anxiety scales. Excluded per criterion #3.",
      aiSummary:
        "Rigorous RCT of 12-week Iyengar yoga vs. health education in 31 fatigued cancer survivors. Reduced inflammation and fatigue but did not measure anxiety with validated instruments. Excluded for missing anxiety outcome.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
  {
    id: "demo-study-hallgren-2014",
    title: "Exercise effects on depressive symptoms in adults with alcohol use disorders: a randomized controlled trial",
    authors: "Hallgren M, Romberg K, Bakshi AS, Andreasson S",
    year: 2014,
    status: "excluded",
    quality: "Medium",
    details: {
      doi: "10.1016/j.ctim.2014.03.003",
      pmid: "24906547",
      journal: "Complementary Therapies in Medicine",
      volume: "22",
      issue: "3",
      pages: "535-543",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/24906547/",
      source: "manual",
      sampleSize: 60,
      keywords: ["exercise", "yoga", "alcohol dependence", "depression", "anxiety"],
      abstract: "Sixty adults in alcohol dependence treatment were randomized to aerobic exercise, yoga, or treatment-as-usual for 12 weeks. The primary outcome was depressive symptoms. Although anxiety was measured as a secondary outcome, yoga was not isolated as the primary intervention — it was one arm of a three-arm exercise comparison where yoga served as a mind-body exercise variant.",
      triageDecision: "exclude",
      exclusionReason: "Yoga was not the primary intervention of interest — it was embedded as one of three exercise modalities in a comparative exercise trial. Anxiety was a secondary outcome only.",
      triageNote: "Resolved from 'maybe' to 'exclude' after team review. Yoga is not isolated as a stand-alone intervention; instead it serves as an exercise comparator arm. Does not meet inclusion criterion #3 (yoga as primary intervention).",
      aiSummary:
        "Three-arm exercise trial (aerobic vs. yoga vs. TAU) in 60 alcohol-dependent adults. Yoga not isolated as primary intervention; serves as exercise comparator. Anxiety only measured secondarily. Excluded after team review.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
  {
    id: "demo-study-smith-2007",
    title: "A randomized comparative trial of yoga and relaxation to reduce stress and anxiety",
    authors: "Smith C, Hancock H, Blake-Mortimer J, Eckert K",
    year: 2007,
    status: "excluded",
    quality: "Medium",
    details: {
      doi: "10.1016/j.ctim.2006.09.008",
      pmid: "17544857",
      journal: "Complementary Therapies in Medicine",
      volume: "15",
      issue: "2",
      pages: "77-83",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/17544857/",
      source: "manual",
      sampleSize: 131,
      keywords: ["yoga", "relaxation", "stress", "anxiety", "healthy adults"],
      abstract: "One hundred thirty-one stressed adults were randomized to 10 weeks of yoga, relaxation, or a control group. Both yoga and relaxation groups showed significant reductions in stress. However, the study primarily targeted stress rather than anxiety disorders, and participants were recruited for perceived stress rather than elevated anxiety. Anxiety was measured as a secondary outcome and showed no significant between-group differences.",
      triageDecision: "exclude",
      exclusionReason: "Population recruited for stress, not anxiety. Anxiety was a secondary outcome with no significant findings. Primary focus does not align with review scope.",
      triageNote: "Large RCT but targets stress reduction in healthy volunteers rather than anxiety in clinical or subclinical populations. Excluded per population criterion.",
      aiSummary:
        "RCT of yoga vs. relaxation vs. control in 131 stressed (not anxious) adults. Anxiety was secondary and showed no significant effect. Excluded because population was stress-focused, not anxiety-focused.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
  {
    id: "demo-study-woolery-2004",
    title: "A yoga intervention for young adults with elevated symptoms of depression",
    authors: "Woolery A, Myers H, Sternlieb B, Zeltzer L",
    year: 2004,
    status: "excluded",
    quality: "Low",
    details: {
      doi: "10.1089/107555304323062931",
      pmid: "15165395",
      journal: "Alternative Therapies in Health and Medicine",
      volume: "10",
      issue: "2",
      pages: "60-63",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/15165395/",
      source: "manual",
      sampleSize: 28,
      keywords: ["Iyengar yoga", "depression", "young adults", "mood"],
      abstract: "Twenty-eight mildly depressed young adults were randomized to 5 weeks of Iyengar yoga (twice weekly) or a waitlist control. The yoga group showed significant reductions in depression (BDI) and improvements in mood states (POMS). However, no validated anxiety-specific outcome was reported — the study focused exclusively on depression and general mood.",
      triageDecision: "exclude",
      exclusionReason: "No validated anxiety-specific outcome measure reported. Study measured only depression (BDI) and general mood (POMS) without an anxiety subscale.",
      triageNote: "Depression-focused RCT without anxiety measurement. Despite yoga intervention meeting criteria, missing anxiety outcome disqualifies per criterion #3.",
      aiSummary:
        "RCT of Iyengar yoga for depression in 28 young adults. Showed depression improvement but measured no anxiety-specific outcome. Excluded for missing anxiety measurement.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
  {
    id: "demo-study-telles-2012",
    title: "Yoga and meditation for anxiety associated with dental treatment: a pilot study",
    authors: "Telles S, Sharma SK, Gupta RK, Bhardwaj AK, Balkrishna A",
    year: 2012,
    status: "excluded",
    quality: "Low",
    details: {
      doi: "10.1016/j.jdent.2012.01.005",
      pmid: "22289555",
      journal: "Journal of Dentistry",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/22289555/",
      source: "manual",
      sampleSize: 20,
      keywords: ["yoga", "meditation", "dental anxiety", "single session"],
      abstract: "Twenty patients with dental anxiety were randomized to a single yoga/meditation session or a control condition before dental treatment. Anxiety was measured immediately before and after the session. While the yoga group showed reduced state anxiety, the intervention consisted of a single brief session (< 30 minutes) rather than a structured multi-session program.",
      triageDecision: "exclude",
      exclusionReason: "Single-session yoga induction (< 1 week) — does not meet minimum intervention duration requirement.",
      triageNote: "Brief single-session induction rather than structured multi-session program. Excluded per eligibility criterion #4 (minimum duration).",
      aiSummary:
        "Single-session yoga for dental anxiety in 20 patients. Showed acute state anxiety reduction but excluded because a single brief session does not constitute a structured yoga intervention per protocol.",
      deepAnalysisComplete: true,
      verified: true,
    },
  },
];

/* ---------------------------------------------------------------------------
 * FILE ASSETS
 * -------------------------------------------------------------------------*/

const DEMO_FILE_ASSETS = [
  {
    id: "demo-file-gupta-2006-pdf",
    studyId: "demo-study-gupta-2006",
    filename: "gupta-2006-yoga-anxiety.pdf",
    publicUrl: "https://ijrap.net/admin/php/uploads/1128_pdf.pdf",
  },
  {
    id: "demo-file-parthasarathy-2014-pdf",
    studyId: "demo-study-khalsa-2006",
    filename: "khalsa-2006-yoga-musicians.pdf",
    publicUrl: "https://pubmed.ncbi.nlm.nih.gov/17220622/",
  },
] as const;

/* ---------------------------------------------------------------------------
 * NOTES — enriched with PRISMA flow, risk of bias, evidence table
 * -------------------------------------------------------------------------*/

const DEMO_NOTES = [
  {
    id: "demo-note-methodological-scope",
    title: "Methodological note: population scope",
    source: "manual" as const,
    tags: ["scope", "population", "methods"],
    content: docFromParagraphs([
      "We include both diagnosed anxiety disorders (GAD, SAD, PD) and elevated subclinical anxiety symptoms (STAI >= 40, BAI >= 16) to capture a broader evidence base.",
      "Subgroup analysis by diagnostic method (DSM-based diagnosis vs. self-report cutoffs) is planned to test whether effect sizes differ by population type.",
      "This decision should be acknowledged in the Discussion as a source of clinical heterogeneity.",
    ]),
  },
  {
    id: "demo-note-comparison-effects",
    title: "Comparison-group effect pattern",
    source: "conversation" as const,
    tags: ["results", "effect-size", "analysis"],
    content: docFromParagraphs([
      "Meta-analysis reveals a counterintuitive pattern: effect sizes are larger for yoga versus active comparators (SMD = -0.86) than for yoga versus no-treatment/waitlist controls (SMD = -0.43).",
      "Possible explanations include: (1) higher baseline anxiety in studies using active comparators, (2) more intensive yoga programs in head-to-head trials, (3) statistical artifact from small study count in the active-comparator subgroup (k = 3).",
      "This pattern should be emphasized in Results and interpreted cautiously in Discussion with explicit mention of the small number of studies contributing to the active-comparator estimate.",
    ]),
  },
  {
    id: "demo-note-small-samples",
    title: "Limitation: small sample sizes",
    source: "manual" as const,
    tags: ["limitations", "bias", "discussion"],
    content: docFromParagraphs([
      "Most included trials are small: median sample size is 40 participants (range: 30-101). Only one study (de Manincor 2016, n=101) exceeds 100 participants.",
      "Small studies are prone to inflated effect sizes, publication bias, and imprecise estimates. The pooled total (N = 319) is modest for meta-analytic conclusions.",
      "Include this limitation prominently in both Abstract and Discussion. Note that funnel plot assessment may be unreliable with fewer than 10 studies.",
    ]),
  },
  {
    id: "demo-note-prisma-flow",
    title: "PRISMA screening flow",
    source: "manual" as const,
    tags: ["prisma", "screening", "methods"],
    content: docFromParagraphs([
      "Records identified through database searching: PubMed (n=487), PsycINFO (n=312), CENTRAL (n=198), Scopus (n=267), IndMED (n=47). Total = 1,311.",
      "Records after removing duplicates: 847.",
      "Titles and abstracts screened: 847. Records excluded at title/abstract: 805 (reasons: not yoga, not anxiety, not RCT, review/commentary, animal study).",
      "Full-text articles assessed for eligibility: 42.",
      "Full-text articles excluded: 34 (reasons: no validated anxiety outcome (n=11), not RCT (n=8), pediatric population (n=5), yoga not primary intervention (n=4), single-session design (n=3), duplicate publication (n=2), no English abstract (n=1)).",
      "Studies included in qualitative synthesis: 8.",
      "Studies included in quantitative synthesis (meta-analysis): 8.",
    ]),
  },
  {
    id: "demo-note-risk-of-bias",
    title: "Risk of bias summary",
    source: "conversation" as const,
    tags: ["quality", "bias", "cochrane"],
    content: docFromParagraphs([
      "Random sequence generation: 4/8 studies at low risk (computer-generated or random number table), 4/8 unclear (method not reported).",
      "Allocation concealment: 2/8 low risk (sealed envelopes), 6/8 unclear risk.",
      "Blinding of participants/personnel: 8/8 high risk — blinding inherently impossible in yoga trials as participants are aware of group assignment.",
      "Blinding of outcome assessment: 2/8 low risk (assessor blinded), 4/8 unclear, 2/8 high risk (self-report outcomes only).",
      "Incomplete outcome data: 5/8 low risk (< 15% attrition with balanced reasons), 2/8 unclear, 1/8 high risk (> 25% attrition).",
      "Selective reporting: 6/8 low risk (all pre-specified outcomes reported), 2/8 unclear (no protocol registration found).",
      "Overall: No study was at low risk across all domains. The most consistent source of bias was lack of participant blinding, which is inherent to the intervention type and cannot be mitigated.",
    ]),
  },
  {
    id: "demo-note-evidence-table",
    title: "Evidence extraction table",
    source: "conversation" as const,
    tags: ["results", "extraction", "data"],
    content: docFromParagraphs([
      "Vahia 1973: n=40, Patanjali-based yoga, 4-6 wk, sham biofeedback control, anxiety symptoms reduced (p<.05).",
      "Norton 1983: n=36, yoga breathing + relaxation, 4 wk, PMR + no-treatment controls, cognitive anxiety reduced (CSAQ, p<.05).",
      "Sahasi 1989: n=45, yogic techniques, 3 mo, diazepam + placebo controls, HAM-A reduced comparably to diazepam.",
      "Broota 1994: n=30, yoga relaxation, 6 wk, PMR control, STAI state + trait improved in both groups.",
      "Woolery was excluded (no anxiety outcome). Khalsa 2006: n=30, Kundalini yoga, 8 wk, no-treatment control, STAI + POMS improved (p<.05).",
      "Gupta 2006: n=62, yoga lifestyle, 10 d intensive, waitlist control, STAI-S (p<.001) and STAI-T (p<.05) reduced.",
      "Javnbakht 2009: n=65, Hatha yoga, 2 mo, waitlist control, BAI reduced (p<.05).",
      "Davis 2015: n=44, restorative yoga, 10 wk, waitlist control, STAI-S reduced (p=.03).",
      "de Manincor 2016: n=101, individualized yoga, 6 wk, waitlist control, DASS-21 anxiety reduced (p=.02).",
    ]),
  },
  {
    id: "demo-note-meta-analysis-results",
    title: "Meta-analysis results summary",
    source: "conversation" as const,
    tags: ["results", "meta-analysis", "statistics"],
    content: docFromParagraphs([
      "Primary outcome — Anxiety (all comparators pooled, k=8): SMD = -0.52, 95% CI [-0.84, -0.19], p = .002, I-squared = 42%.",
      "Subgroup: Yoga vs. no treatment/waitlist (k=5): SMD = -0.43, 95% CI [-0.74, -0.11], p = .008, I-squared = 28%. Small-to-moderate effect.",
      "Subgroup: Yoga vs. active comparators (k=3): SMD = -0.86, 95% CI [-1.56, -0.15], p = .02, I-squared = 54%. Large effect but wide CI and high heterogeneity.",
      "Secondary outcome — Depression (k=5): SMD = -0.35, 95% CI [-0.66, -0.04], p = .03. Small effect favoring yoga.",
      "Subgroup by diagnosis: DSM-diagnosed anxiety disorders (k=3) showed non-significant effects (p = .14). Self-report elevated anxiety (k=5) showed significant effects (p = .004).",
      "Sensitivity analysis excluding high risk-of-bias studies (k=5): SMD = -0.47, 95% CI [-0.82, -0.12], p = .009. Results robust to exclusion of lower-quality studies.",
      "Publication bias: Funnel plot appears roughly symmetric. Egger's test p = .31 (non-significant), but interpretation limited with k < 10 studies.",
    ]),
  },
  {
    id: "demo-note-search-details",
    title: "Search dates and updates",
    source: "manual" as const,
    tags: ["methods", "search", "dates"],
    content: docFromParagraphs([
      "Systematic search conducted through October 2016. No date or language restrictions were applied to the initial search.",
      "Databases searched: PubMed/MEDLINE, PsycINFO, Cochrane CENTRAL, Scopus, and IndMED.",
      "Reference lists of included studies and relevant systematic reviews were hand-searched for additional eligible trials.",
      "Grey literature was not systematically searched. Conference abstracts and dissertations were excluded per protocol.",
      "A search update was not performed for this demo review. In practice, an update search should be run before final publication.",
    ]),
  },
];

/* ---------------------------------------------------------------------------
 * PROJECT MEMORIES — enriched
 * -------------------------------------------------------------------------*/

const DEMO_PROJECT_MEMORIES = [
  {
    id: "demo-memory-include-subclinical",
    type: "decision",
    category: "population",
    statement: "Include subclinical anxiety populations alongside diagnosed anxiety disorders.",
    rationale: "Broadens evidence capture while preserving anxiety-focused outcomes. Subgroup analysis by diagnosis method planned to test effect modification.",
    importance: "important",
    tags: ["demo", "population", "scope"],
  },
  {
    id: "demo-memory-yoga-definition",
    type: "definition",
    category: "intervention",
    statement: "Yoga intervention means a structured program where asana, pranayama, or meditation is a core component, delivered over multiple sessions (minimum 1 week).",
    rationale: "Keeps intervention boundary explicit during screening and extraction. Single-session inductions and pure meditation-only programs are excluded.",
    importance: "critical",
    tags: ["demo", "intervention"],
  },
  {
    id: "demo-memory-duration-threshold",
    type: "criterion",
    category: "inclusion",
    statement: "Prefer interventions with at least 4 weeks of structured practice. Shorter intensive programs (e.g., 10-day retreats) are acceptable if they involve daily structured sessions.",
    rationale: "Short single-session interventions are less likely to show durable anxiety change. The included studies range from 10 days to 3 months.",
    importance: "normal",
    tags: ["demo", "duration"],
  },
  {
    id: "demo-memory-moderator-goal",
    type: "goal",
    category: "outcome",
    statement: "Assess whether yoga style (Hatha, Kundalini, restorative, integrated) moderates observed anxiety effect sizes.",
    rationale: "Helps explain heterogeneity across included studies. Insufficient studies per style for formal subgroup analysis, but narrative comparison is planned.",
    importance: "important",
    tags: ["demo", "heterogeneity"],
  },
  {
    id: "demo-memory-active-comparator",
    type: "definition",
    category: "comparison",
    statement: "Active comparator is defined as any structured intervention: CBT, progressive muscle relaxation, pharmacotherapy, health education, or structured exercise. Waitlist and no-treatment controls are classified separately.",
    rationale: "Needed for the planned subgroup analysis comparing effect sizes by comparator type.",
    importance: "important",
    tags: ["demo", "comparator", "analysis"],
  },
  {
    id: "demo-memory-dsm-subgroup",
    type: "decision",
    category: "analysis",
    statement: "Report separate meta-analytic estimates for DSM-diagnosed anxiety disorders versus self-report elevated anxiety, as effects may differ by population.",
    rationale: "Preliminary signal that DSM-diagnosed subgroup shows non-significant pooled effect (p = .14) while self-report subgroup shows significant effect (p = .004).",
    importance: "critical",
    tags: ["demo", "subgroup", "diagnosis"],
  },
  {
    id: "demo-memory-blinding-limitation",
    type: "decision",
    category: "quality",
    statement: "Accept that participant blinding is inherently impossible in yoga trials. Do not downgrade evidence quality solely for this reason, but discuss it as an inherent limitation of the evidence base.",
    rationale: "All 8 included studies are at high risk for performance bias due to unblinded participants — this is a structural feature of behavioral interventions, not a study-specific failing.",
    importance: "normal",
    tags: ["demo", "blinding", "bias"],
  },
  {
    id: "demo-memory-adverse-events",
    type: "goal",
    category: "safety",
    statement: "Report adverse events and safety data from all included studies. No serious adverse events were reported across the 8 included trials.",
    rationale: "Safety reporting strengthens the review's clinical relevance and is required by PRISMA guidelines.",
    importance: "normal",
    tags: ["demo", "safety", "adverse-events"],
  },
] as const;

/* ---------------------------------------------------------------------------
 * HELPER — build TipTap JSON documents
 * -------------------------------------------------------------------------*/

function docFromParagraphs(paragraphs: string[]): JSONContent {
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}

function p(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function pWithCitations(...parts: (string | { id: string; label: string })[]): JSONContent {
  return {
    type: "paragraph",
    content: parts.map((part) =>
      typeof part === "string"
        ? { type: "text", text: part }
        : { type: "citation", attrs: { id: part.id, label: part.label } }
    ),
  };
}

const cite = {
  broota: { id: "demo-study-broota-1994", label: "Broota & Sanghvi, 1994" },
  davis: { id: "demo-study-davis-2015", label: "Davis et al., 2015" },
  demanincor: { id: "demo-study-demanincor-2016", label: "de Manincor et al., 2016" },
  gupta: { id: "demo-study-gupta-2006", label: "Gupta et al., 2006" },
  javnbakht: { id: "demo-study-javnbakht-2009", label: "Javnbakht et al., 2009" },
  khalsa: { id: "demo-study-khalsa-2006", label: "Khalsa & Cope, 2006" },
  norton: { id: "demo-study-norton-1983", label: "Norton & Johnson, 1983" },
  sahasi: { id: "demo-study-sahasi-1989", label: "Sahasi et al., 1989" },
  vahia: { id: "demo-study-vahia-1973", label: "Vahia et al., 1973" },
};

/* ---------------------------------------------------------------------------
 * DRAFT SECTIONS — complete manuscript
 * -------------------------------------------------------------------------*/

function abstractDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("Background: Anxiety disorders are among the most prevalent mental health conditions worldwide, and many patients seek complementary approaches to pharmacological treatment. Yoga has gained attention as a potential adjunctive intervention, but the consistency and magnitude of its effects across different comparator conditions remain unclear."),
      p("Objective: To systematically review and meta-analyze randomized controlled trials (RCTs) evaluating the effects of yoga on anxiety symptoms in adults compared with no treatment/waitlist or active interventions."),
      p("Methods: We searched PubMed, PsycINFO, Cochrane CENTRAL, Scopus, and IndMED through October 2016 for RCTs of structured yoga interventions reporting validated anxiety outcomes in adults (>= 18 years). Risk of bias was assessed using the Cochrane Risk of Bias tool. Random-effects meta-analysis was performed using standardized mean differences (SMD)."),
      pWithCitations(
        "Results: Eight RCTs with 319 participants (mean age range: 30.0-38.5 years) were included. Meta-analysis revealed small short-term effects of yoga on anxiety compared with no treatment (SMD = -0.43; 95% CI: -0.74, -0.11; p = .008) and large effects compared with active comparators (SMD = -0.86; 95% CI: -1.56, -0.15; p = .02). Small effects on depression were found versus no treatment (SMD = -0.35; p = .03). Effects were significant for self-report anxiety but not for DSM-diagnosed anxiety disorders. No serious adverse events were reported across the included trials ",
        cite.davis,
        "; ",
        cite.demanincor,
        "; ",
        cite.sahasi,
        ".",
      ),
      p("Conclusion: Yoga may be an effective and safe intervention for reducing anxiety symptoms in adults with elevated anxiety, though evidence remains inconclusive for formally diagnosed anxiety disorders. Larger, rigorously designed RCTs with longer follow-up periods are needed to strengthen this evidence base."),
    ],
  };
}

function introDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("Anxiety disorders, including generalized anxiety disorder (GAD), social anxiety disorder (SAD), and panic disorder (PD), are among the most prevalent mental health conditions globally, affecting an estimated 284 million people worldwide. These disorders are associated with substantial disability, reduced quality of life, and significant economic burden through healthcare utilization and lost productivity."),
      p("Current first-line treatments include cognitive-behavioral therapy (CBT) and pharmacotherapy (selective serotonin reuptake inhibitors, serotonin-norepinephrine reuptake inhibitors, and benzodiazepines). While effective, these treatments have notable limitations: pharmacotherapy carries risks of side effects, dependency (particularly benzodiazepines), and withdrawal symptoms, while access to evidence-based psychotherapy remains limited by therapist availability and cost. Consequently, many patients seek complementary and integrative approaches to manage anxiety symptoms."),
      pWithCitations(
        "Yoga, an ancient mind-body practice originating from India, has attracted growing scientific interest as a potential intervention for anxiety. Yoga typically integrates physical postures (asana), controlled breathing (pranayama), and meditation or relaxation techniques. Several mechanisms have been proposed for yoga's anxiolytic effects, including downregulation of the hypothalamic-pituitary-adrenal (HPA) axis, enhanced gamma-aminobutyric acid (GABA) signaling, improved vagal tone, and increased mindful awareness of bodily sensations. Preliminary randomized evidence supports these proposed mechanisms, with several trials reporting significant anxiety reduction ",
        cite.davis,
        "; ",
        cite.gupta,
        "; ",
        cite.javnbakht,
        ".",
      ),
      pWithCitations(
        "Prior reviews have examined yoga for broader mental health outcomes, but few have focused specifically on anxiety with rigorous inclusion criteria limited to randomized controlled trials. Earlier narrative reviews were limited by inclusion of non-randomized designs and heterogeneous outcome measures. The available RCTs span diverse yoga styles (Hatha, Kundalini, Iyengar, integrated yoga), populations (clinical and subclinical anxiety), and comparators (waitlist, active treatments including pharmacotherapy) ",
        cite.khalsa,
        "; ",
        cite.sahasi,
        "; ",
        cite.vahia,
        ". A systematic synthesis with meta-analysis is needed to quantify the pooled effect and explore sources of heterogeneity.",
      ),
      p("The aim of this systematic review and meta-analysis is to evaluate the effectiveness and safety of yoga for anxiety symptoms in adults. Specifically, we sought to: (1) estimate the overall effect of yoga on anxiety compared with no treatment and active interventions, (2) examine secondary effects on depression and quality of life, (3) explore whether effects differ by comparator type, diagnosis method, or yoga style, and (4) assess the safety profile of yoga interventions in this population."),
    ],
  };
}

function methodsDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("This systematic review was conducted in accordance with the Preferred Reporting Items for Systematic Reviews and Meta-Analyses (PRISMA) guidelines. The protocol was developed a priori and specified the search strategy, eligibility criteria, outcome measures, and analysis plan."),

      p("Search Strategy"),
      p("We systematically searched PubMed/MEDLINE, PsycINFO, the Cochrane Central Register of Controlled Trials (CENTRAL), Scopus, and IndMED from inception through October 2016. No date or language restrictions were applied. The search strategy combined terms related to yoga (yoga, mind-body, pranayama, asana), anxiety (anxiety, anxiety disorders, GAD, panic, phobia), and study design (randomized, randomised, controlled trial, RCT) using database-specific syntax including MeSH terms for PubMed and Emtree terms for Scopus. Reference lists of included studies and relevant systematic reviews were hand-searched for additional eligible trials."),

      p("Eligibility Criteria"),
      pWithCitations(
        "Studies were eligible if they: (1) used a randomized controlled trial design, (2) enrolled adult participants (>= 18 years), (3) evaluated a structured yoga intervention as a primary or stand-alone treatment arm, and (4) reported at least one validated anxiety outcome measure. Exclusion criteria were: non-randomized or uncontrolled designs, pediatric populations, absence of validated anxiety measures, single-session yoga inductions, and unpublished grey literature. When multiple publications reported on the same trial, the most complete report was retained. Both waitlist/no-treatment controls and active comparators (e.g., CBT, progressive muscle relaxation, pharmacotherapy) were eligible ",
        cite.norton,
        "; ",
        cite.sahasi,
        ".",
      ),

      p("Study Selection"),
      p("Two reviewers independently screened titles and abstracts against the eligibility criteria. Full texts of potentially eligible articles were retrieved and assessed independently. Disagreements were resolved by consensus discussion, with a third reviewer consulted when needed. The screening process is reported in the PRISMA flow diagram."),

      p("Data Extraction"),
      pWithCitations(
        "Data were extracted independently by two reviewers using a standardized form capturing: study design, sample size, participant characteristics (age, sex, anxiety diagnosis method), yoga intervention details (style, frequency, duration, components), comparator type and description, outcome measures and instruments, results (means, SDs, effect sizes), and adverse events. Authors were contacted for missing data when feasible ",
        cite.davis,
        "; ",
        cite.demanincor,
        ".",
      ),

      p("Risk of Bias Assessment"),
      p("Risk of bias was assessed using the Cochrane Risk of Bias (RoB 1.0) tool across seven domains: random sequence generation, allocation concealment, blinding of participants and personnel, blinding of outcome assessment, incomplete outcome data, selective reporting, and other bias. Each domain was rated as low, high, or unclear risk. Two reviewers assessed each study independently, with disagreements resolved by consensus."),

      p("Data Synthesis"),
      p("Meta-analysis was performed using a random-effects model (DerSimonian-Laird) with standardized mean differences (SMD, Hedges' g) as the summary measure. Statistical heterogeneity was assessed using the I-squared statistic and Cochran's Q test, with I-squared > 50% indicating substantial heterogeneity. Pre-specified subgroup analyses were conducted by: (a) comparator type (waitlist/no treatment vs. active comparators), (b) anxiety diagnosis method (DSM criteria vs. self-report instruments), and (c) yoga style (where sufficient studies were available). Sensitivity analyses excluded studies at high risk of bias. Publication bias was assessed by visual inspection of funnel plots and Egger's regression test, with the caveat that these methods have limited power with fewer than 10 studies."),
    ],
  };
}

function resultsDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("Study Selection"),
      p("The systematic search identified 1,311 records across five databases (PubMed: 487, PsycINFO: 312, CENTRAL: 198, Scopus: 267, IndMED: 47). After removing 464 duplicates, 847 records were screened by title and abstract, of which 805 were excluded. Forty-two full-text articles were assessed for eligibility. Thirty-four were excluded for the following reasons: no validated anxiety outcome (n=11), non-randomized design (n=8), pediatric population (n=5), yoga not the primary intervention (n=4), single-session design (n=3), duplicate publication (n=2), and no English abstract (n=1). Eight RCTs met all inclusion criteria and were included in both qualitative and quantitative synthesis."),

      p("Study Characteristics"),
      pWithCitations(
        "The eight included RCTs enrolled a total of 319 participants with mean ages ranging from 30.0 to 38.5 years. Publication dates ranged from 1973 to 2016, spanning over four decades of research. Sample sizes ranged from 30 to 101 participants (median = 40). Four studies compared yoga with waitlist or no-treatment controls ",
        cite.davis,
        "; ",
        cite.demanincor,
        "; ",
        cite.gupta,
        "; ",
        cite.javnbakht,
        ", while three studies included active comparators (progressive muscle relaxation, diazepam, or sham biofeedback) ",
        cite.norton,
        "; ",
        cite.sahasi,
        "; ",
        cite.vahia,
        ", and one included both a no-treatment control and an active comparison group ",
        cite.khalsa,
        ".",
      ),
      pWithCitations(
        "Yoga interventions varied in style (Hatha, Kundalini, Iyengar, integrated, Patanjali-based), duration (10 days to 3 months), and frequency (daily to twice weekly). Anxiety was measured using diverse validated instruments: State-Trait Anxiety Inventory (STAI; k=4), Hamilton Anxiety Rating Scale (HAM-A; k=1), Beck Anxiety Inventory (BAI; k=1), Depression Anxiety Stress Scales (DASS-21; k=1), and Cognitive-Somatic Anxiety Questionnaire (CSAQ; k=1) ",
        cite.broota,
        "; ",
        cite.norton,
        "; ",
        cite.sahasi,
        ".",
      ),

      p("Risk of Bias"),
      p("No study was assessed as having low risk of bias across all domains. The most consistent concern was lack of participant blinding (8/8 studies at high risk), which is inherent to behavioral interventions where participants are aware of their assigned condition. Random sequence generation was adequate in four studies and unclear in four. Allocation concealment was adequate in two studies and unclear in six. Blinding of outcome assessment was at low risk in two studies that used independent assessors. Attrition was low (< 15%) in five studies. Selective reporting risk was low in six studies. Overall, the evidence base carries moderate-to-high risk of bias, primarily driven by the structural impossibility of blinding and frequent under-reporting of allocation procedures."),

      p("Primary Outcome: Anxiety"),
      p("Meta-analysis of all eight studies revealed a moderate overall effect of yoga on anxiety symptoms (SMD = -0.52; 95% CI: -0.84, -0.19; p = .002; I-squared = 42%), indicating moderate heterogeneity."),
      pWithCitations(
        "Subgroup analysis by comparator type showed a small effect of yoga versus no treatment/waitlist (k=5; SMD = -0.43; 95% CI: -0.74, -0.11; p = .008; I-squared = 28%) and a large effect versus active comparators (k=3; SMD = -0.86; 95% CI: -1.56, -0.15; p = .02; I-squared = 54%). The larger effect size in the active-comparator subgroup was unexpected and should be interpreted with caution given the small number of contributing studies and wide confidence interval ",
        cite.norton,
        "; ",
        cite.sahasi,
        "; ",
        cite.vahia,
        ".",
      ),
      p("Subgroup analysis by anxiety diagnosis method revealed significant effects for studies enrolling participants with self-report elevated anxiety (k=5; SMD = -0.56; 95% CI: -0.89, -0.23; p = .004) but non-significant effects for studies enrolling participants with DSM-diagnosed anxiety disorders (k=3; SMD = -0.38; 95% CI: -0.94, 0.18; p = .14). This finding suggests that current evidence supports yoga for anxiety symptom reduction but not specifically for diagnosed anxiety disorders."),

      p("Secondary Outcomes"),
      pWithCitations(
        "Depression: Five studies reported depression outcomes. Meta-analysis showed a small but significant effect favoring yoga over no treatment (SMD = -0.35; 95% CI: -0.66, -0.04; p = .03; I-squared = 18%) ",
        cite.davis,
        "; ",
        cite.demanincor,
        "; ",
        cite.javnbakht,
        ".",
      ),
      p("Quality of life: Insufficient studies (k=2) reported quality of life outcomes to permit meta-analysis. Narrative review suggested trends toward improved well-being in both studies."),

      p("Safety"),
      p("No serious adverse events were reported in any included trial. Two studies explicitly reported that no adverse events occurred. The remaining six studies did not systematically report adverse events. No study reported dropout due to yoga-related injury or discomfort."),

      p("Sensitivity Analysis and Publication Bias"),
      p("Sensitivity analysis excluding three studies with high risk of bias on the random sequence generation domain (k=5) yielded a similar effect size (SMD = -0.47; 95% CI: -0.82, -0.12; p = .009), suggesting the primary result is robust. Funnel plot inspection showed roughly symmetric distribution. Egger's regression test was non-significant (p = .31), though interpretation is limited given the small number of studies (k < 10)."),
    ],
  };
}

function discussionDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("Summary of Main Findings"),
      pWithCitations(
        "This systematic review and meta-analysis of eight RCTs with 319 participants found that yoga is associated with moderate reductions in anxiety symptoms compared with control conditions. Specifically, yoga produced small-to-moderate effects against no treatment/waitlist (SMD = -0.43) and large effects against active comparators (SMD = -0.86), though the latter estimate is based on only three studies with wide confidence intervals. Yoga also showed small beneficial effects on depressive symptoms. No serious adverse events were reported, supporting yoga's safety profile in this population ",
        cite.davis,
        "; ",
        cite.demanincor,
        "; ",
        cite.sahasi,
        ".",
      ),

      p("Comparison with Prior Reviews"),
      p("Our findings are broadly consistent with earlier narrative reviews suggesting that yoga has anxiolytic potential. However, by restricting inclusion to RCTs and conducting meta-analysis, we provide more precise effect estimates than prior reviews that included uncontrolled studies. The overall effect size (SMD = -0.52) is comparable to those reported for other complementary interventions such as tai chi and meditation for anxiety, though smaller than effect sizes typically reported for CBT (SMD = -0.80 to -1.20)."),

      p("Interpretation of the Comparator-Type Finding"),
      pWithCitations(
        "The finding that yoga showed larger effects against active comparators than against waitlist controls is counterintuitive, as one would expect the smallest effects when comparing to an active treatment. Several explanations merit consideration. First, the three active-comparator studies ",
        cite.norton,
        "; ",
        cite.sahasi,
        "; ",
        cite.vahia,
        " enrolled participants with clinically diagnosed anxiety and may have had higher baseline severity, allowing greater room for improvement. Second, these studies used more intensive yoga programs (daily practice, 4-12 weeks), potentially driving larger effects. Third, with only three studies contributing to this estimate, the result may reflect statistical imprecision or chance findings rather than a genuine differential effect. This finding requires replication in larger trials before drawing clinical conclusions.",
      ),

      p("The Diagnosis-Method Distinction"),
      p("A clinically important finding is that yoga showed significant effects for participants with self-report elevated anxiety but not for those with DSM-diagnosed anxiety disorders. This pattern may reflect genuine differences in treatment responsiveness between subclinical and clinical populations, or it may be an artifact of insufficient statistical power in the DSM-diagnosed subgroup (k=3). Future trials should specifically enroll participants with formal anxiety disorder diagnoses to clarify this question."),

      p("Strengths and Limitations"),
      pWithCitations(
        "This review has several strengths: comprehensive search across five databases, restriction to RCTs, pre-specified subgroup analyses, and quantitative synthesis. However, important limitations must be acknowledged. First, most included studies were small (median n=40, total N=319) ",
        cite.broota,
        "; ",
        cite.khalsa,
        "; ",
        cite.norton,
        ", raising concern about inflated effect sizes and imprecise estimates. Second, all studies were at high risk of performance bias due to the inherent impossibility of blinding participants to yoga. Third, the yoga interventions were heterogeneous in style, duration, and intensity, which may contribute to between-study variability. Fourth, follow-up periods were short (typically post-intervention only), and long-term effects remain unknown. Fifth, the search was conducted through October 2016, and more recent trials may exist.",
      ),

      p("Implications for Practice"),
      p("Despite these limitations, the available evidence suggests that yoga may be a useful adjunctive intervention for adults with elevated anxiety symptoms. Yoga's favorable safety profile, low cost, accessibility, and potential secondary benefits (improved fitness, social connection, mindfulness skills) make it an attractive complementary option. Clinicians may consider recommending structured yoga programs as part of a multimodal treatment plan, while counseling patients that the evidence is stronger for symptom-level anxiety than for formally diagnosed anxiety disorders."),

      p("Implications for Research"),
      pWithCitations(
        "Future research should prioritize: (1) larger, adequately powered RCTs (target n >= 100 per arm), (2) enrollment of participants with formally diagnosed anxiety disorders, (3) standardized yoga intervention protocols to enable cross-study comparison, (4) active comparators to determine yoga's specific versus nonspecific effects, (5) longer follow-up periods (>= 6 months), and (6) systematic adverse event monitoring and reporting. Head-to-head comparisons of different yoga styles would help identify optimal intervention parameters ",
        cite.demanincor,
        "; ",
        cite.gupta,
        ".",
      ),
    ],
  };
}

function conclusionDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      pWithCitations(
        "This meta-analysis of eight RCTs (N = 319) provides evidence that yoga is associated with moderate reductions in anxiety symptoms in adults compared with no treatment (SMD = -0.43, p = .008) and active comparators (SMD = -0.86, p = .02). Small benefits for depressive symptoms were also observed (SMD = -0.35, p = .03). No serious adverse events were reported ",
        cite.davis,
        "; ",
        cite.demanincor,
        "; ",
        cite.sahasi,
        ".",
      ),
      p("Importantly, the evidence supports yoga for individuals with elevated anxiety symptoms identified by self-report measures but remains inconclusive for formally diagnosed anxiety disorders. This distinction has direct clinical implications: yoga can be recommended as a complementary approach for subclinical anxiety, but should not replace evidence-based treatments (CBT, pharmacotherapy) for diagnosed anxiety disorders without stronger supporting evidence."),
      p("The current evidence base is limited by small sample sizes, heterogeneous interventions, inherent impossibility of blinding, and short follow-up periods. Larger, rigorously designed trials with standardized yoga protocols, formal diagnostic criteria for enrollment, active comparators, and extended follow-up are needed to advance this field. Given yoga's favorable safety profile and accessibility, investment in high-quality research is warranted."),
    ],
  };
}

function referencesDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("Included Studies"),
      p(""),
      pWithCitations(
        "1. ",
        cite.broota,
        " Efficacy of two relaxation techniques in examination anxiety. Journal of Personality and Clinical Studies, 10(1-2), 29-35.",
      ),
      pWithCitations(
        "2. ",
        cite.davis,
        " Restorative yoga for women with breast cancer: findings from a randomized pilot study. Complementary Therapies in Clinical Practice, 21(3), 139-144. doi:10.1016/j.ctcp.2015.06.005",
      ),
      pWithCitations(
        "3. ",
        cite.demanincor,
        " Individualized yoga for reducing depression and anxiety, and improving well-being: a randomized controlled trial. Depression and Anxiety, 33(9), 816-828. doi:10.1002/da.22502",
      ),
      pWithCitations(
        "4. ",
        cite.gupta,
        " Effect of yoga based lifestyle intervention on state and trait anxiety. Indian Journal of Physiology and Pharmacology, 50(1), 41-47.",
      ),
      pWithCitations(
        "5. ",
        cite.javnbakht,
        " Effects of yoga on depression and anxiety of women. Complementary Therapies in Clinical Practice, 15(2), 102-104. doi:10.1016/j.ctcp.2009.03.003",
      ),
      pWithCitations(
        "6. ",
        cite.khalsa,
        " Yoga ameliorates performance anxiety and mood disturbance in young professional musicians. Applied Psychophysiology and Biofeedback, 31(4), 279-293.",
      ),
      pWithCitations(
        "7. ",
        cite.norton,
        " A comparison of two relaxation procedures for reducing cognitive and somatic anxiety. Journal of Behavior Therapy and Experimental Psychiatry, 14(3), 209-214. doi:10.1016/0005-7916(83)90050-2",
      ),
      pWithCitations(
        "8. ",
        cite.sahasi,
        " Efficacy of yogic techniques in the treatment of anxiety neurosis. Indian Journal of Psychiatry, 31(2), 147-152.",
      ),
      pWithCitations(
        "9. ",
        cite.vahia,
        " Further experience with the therapy based upon concepts of Patanjali in the treatment of psychiatric disorders. Indian Journal of Psychiatry, 15(1), 32-37.",
      ),
      p(""),
      p("Excluded Studies (with Reasons)"),
      p(""),
      p("10. Bower JE, Crosswell AD, Stanton AL, et al. (2014). Yoga reduces inflammatory signaling in fatigued breast cancer survivors: a randomized controlled trial. Psychoneuroendocrinology, 43, 20-29. [Excluded: no validated anxiety-specific outcome]"),
      p("11. Hagins M, Rundle A, Consedine NS, Khalsa SBS (2013). Effectiveness of yoga versus stretching in reducing anxiety and depression in sixth graders. Mindfulness, 5(3), 312-324. [Excluded: pediatric population]"),
      p("12. Hallgren M, Romberg K, Bakshi AS, Andreasson S (2014). Exercise effects on depressive symptoms in adults with alcohol use disorders. Complementary Therapies in Medicine, 22(3), 535-543. [Excluded: yoga not primary intervention]"),
      p("13. Kozasa EH, Santos RF, Rueda AD, et al. (2008). Evaluation of Siddha Samadhi yoga for anxiety and depression symptoms. Psychological Reports, 103(1), 271-274. [Excluded: non-randomized design]"),
      p("14. Smith C, Hancock H, Blake-Mortimer J, Eckert K (2007). A randomized comparative trial of yoga and relaxation to reduce stress and anxiety. Complementary Therapies in Medicine, 15(2), 77-83. [Excluded: stress population, no significant anxiety outcome]"),
      p("15. Telles S, Sharma SK, Gupta RK, et al. (2012). Yoga and meditation for anxiety associated with dental treatment. Journal of Dentistry. [Excluded: single-session design]"),
      p("16. Woolery A, Myers H, Sternlieb B, Zeltzer L (2004). A yoga intervention for young adults with elevated symptoms of depression. Alternative Therapies in Health and Medicine, 10(2), 60-63. [Excluded: no anxiety-specific outcome]"),
      p(""),
      p("Background References"),
      p(""),
      p("17. Cramer H, Lauche R, Anheyer D, Pilkington K, de Manincor M, Dobos G, Ward L (2018). Yoga for anxiety: a systematic review and meta-analysis of randomized controlled trials. Depression and Anxiety, 35(9), 830-843. doi:10.1002/da.22762"),
      p("18. Hofmann SG, Sawyer AT, Witt AA, Oh D (2010). The effect of mindfulness-based therapy on anxiety and depression: a meta-analytic review. Journal of Consulting and Clinical Psychology, 78(2), 169-183."),
      p("19. Kirkwood G, Rampes H, Tuffrey V, Richardson J, Pilkington K (2005). Yoga for anxiety: a systematic review of the research evidence. British Journal of Sports Medicine, 39(12), 884-891."),
      p("20. Streeter CC, Gerbarg PL, Saper RB, Ciraulo DA, Brown RP (2012). Effects of yoga on the autonomic nervous system, gamma-aminobutyric-acid, and allostasis in epilepsy, depression, and post-traumatic stress disorder. Medical Hypotheses, 78(5), 571-579."),
    ],
  };
}

function fundingDoc(): JSONContent {
  return docFromParagraphs([
    "No specific external funding was received for the conduct of this systematic review and meta-analysis.",
    "The authors received no financial support from any organization or institution for the submitted work. No funding bodies had any role in the study design, data collection, analysis, interpretation of results, or preparation of the manuscript.",
  ]);
}

function conflictsDoc(): JSONContent {
  return docFromParagraphs([
    "The authors declare no conflicts of interest related to this work.",
    "None of the authors have financial or personal relationships with organizations that could inappropriately influence this review. No author has received honoraria, consulting fees, or research funding from yoga-related organizations, pharmaceutical companies, or other entities with a direct interest in the findings of this review.",
  ]);
}

function supplementDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      p("Supplementary Material"),
      p(""),
      p("Table S1. Detailed Search Strategy by Database"),
      p("PubMed/MEDLINE: (\"yoga\"[MeSH Terms] OR yoga[Title/Abstract] OR \"mind-body\"[Title/Abstract] OR pranayama[Title/Abstract] OR asana[Title/Abstract]) AND (\"anxiety\"[MeSH Terms] OR \"anxiety disorders\"[MeSH Terms] OR anxiety[Title/Abstract]) AND (\"randomized controlled trial\"[Publication Type] OR randomized[Title/Abstract] OR randomised[Title/Abstract] OR \"controlled trial\"[Title/Abstract])"),
      p("PsycINFO: (DE \"Yoga\" OR TI yoga OR AB yoga OR TI \"mind-body\" OR AB \"mind-body\") AND (DE \"Anxiety\" OR DE \"Anxiety Disorders\" OR TI anxiety OR AB anxiety) AND (TI randomized OR AB randomized OR TI randomised OR AB randomised OR TI \"controlled trial\" OR AB \"controlled trial\")"),
      p("Cochrane CENTRAL: (yoga OR \"mind-body\" OR pranayama) AND (anxiety OR \"anxiety disorder*\") in Title Abstract Keyword — limited to Trials"),
      p("Scopus: TITLE-ABS-KEY(yoga AND anxiety AND (randomized OR randomised OR \"controlled trial\"))"),
      p("IndMED: yoga AND anxiety AND (trial OR randomized)"),
      p(""),
      p("Table S2. Risk of Bias Domain-Level Judgments"),
      p("Vahia 1973: Sequence=Unclear, Concealment=Unclear, Participant blinding=High, Assessor blinding=Unclear, Attrition=Unclear, Reporting=Unclear"),
      p("Norton 1983: Sequence=Unclear, Concealment=Unclear, Participant blinding=High, Assessor blinding=High (self-report only), Attrition=Low, Reporting=Low"),
      p("Sahasi 1989: Sequence=Unclear, Concealment=Unclear, Participant blinding=High, Assessor blinding=Low (clinician-rated HAM-A), Attrition=Low, Reporting=Low"),
      p("Broota 1994: Sequence=Unclear, Concealment=Unclear, Participant blinding=High, Assessor blinding=High (self-report), Attrition=Unclear, Reporting=Unclear"),
      p("Gupta 2006: Sequence=Low (random number table), Concealment=Unclear, Participant blinding=High, Assessor blinding=Unclear, Attrition=Low, Reporting=Low"),
      p("Khalsa 2006: Sequence=Low (computer-generated), Concealment=Low (sealed envelopes), Participant blinding=High, Assessor blinding=Unclear, Attrition=Low, Reporting=Low"),
      p("Javnbakht 2009: Sequence=Low (random number table), Concealment=Unclear, Participant blinding=High, Assessor blinding=Unclear, Attrition=High (>25%), Reporting=Low"),
      p("Davis 2015: Sequence=Low (computer-generated), Concealment=Low (sealed envelopes), Participant blinding=High, Assessor blinding=Low (blinded assessor), Attrition=Low, Reporting=Low"),
      p("de Manincor 2016: Sequence=Low (computer-generated), Concealment=Unclear, Participant blinding=High, Assessor blinding=Unclear, Attrition=Low, Reporting=Low"),
      p(""),
      p("PRISMA 2009 Checklist"),
      p("This review adheres to the PRISMA 2009 reporting guidelines. All 27 checklist items have been addressed in the main manuscript and this supplementary material. The PRISMA flow diagram is presented in the Results section."),
    ],
  };
}

/* ---------------------------------------------------------------------------
 * DRAFT STATE — all sections populated with citation linkage
 * -------------------------------------------------------------------------*/

function buildDemoDraftState(): DraftState {
  const state = createDefaultDraftState();
  state.mode = "section";
  state.activeSection = "results";

  // Populate all 10 sections
  state.contentBySection.abstract = abstractDoc();
  state.contentBySection.introduction = introDoc();
  state.contentBySection.methods = methodsDoc();
  state.contentBySection.results = resultsDoc();
  state.contentBySection.discussion = discussionDoc();
  state.contentBySection.conclusion = conclusionDoc();
  state.contentBySection.references = referencesDoc();
  state.contentBySection.funding = fundingDoc();
  state.contentBySection.conflicts = conflictsDoc();
  state.contentBySection.supplement = supplementDoc();

  // Citation linkage per section (study IDs referenced in that section)
  const allIncluded = [
    "demo-study-broota-1994",
    "demo-study-davis-2015",
    "demo-study-demanincor-2016",
    "demo-study-gupta-2006",
    "demo-study-javnbakht-2009",
    "demo-study-khalsa-2006",
    "demo-study-norton-1983",
    "demo-study-sahasi-1989",
    "demo-study-vahia-1973",
  ];

  state.ledgerBySection.abstract = ["demo-study-davis-2015", "demo-study-demanincor-2016", "demo-study-sahasi-1989"];
  state.ledgerBySection.introduction = ["demo-study-davis-2015", "demo-study-gupta-2006", "demo-study-javnbakht-2009", "demo-study-khalsa-2006", "demo-study-sahasi-1989", "demo-study-vahia-1973"];
  state.ledgerBySection.methods = ["demo-study-davis-2015", "demo-study-demanincor-2016", "demo-study-norton-1983", "demo-study-sahasi-1989"];
  state.ledgerBySection.results = [...allIncluded];
  state.ledgerBySection.discussion = ["demo-study-broota-1994", "demo-study-davis-2015", "demo-study-demanincor-2016", "demo-study-gupta-2006", "demo-study-khalsa-2006", "demo-study-norton-1983", "demo-study-sahasi-1989", "demo-study-vahia-1973"];
  state.ledgerBySection.conclusion = ["demo-study-davis-2015", "demo-study-demanincor-2016", "demo-study-sahasi-1989"];
  state.ledgerBySection.references = [...allIncluded];

  // Include optional sections in the section order
  state.sectionOrder = [
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
    "references",
    "funding",
    "conflicts",
    "supplement",
  ];

  return state;
}

const DEMO_DRAFT_STATE = buildDemoDraftState();

/* ---------------------------------------------------------------------------
 * CONVERSATION SEED
 * -------------------------------------------------------------------------*/

function demoWelcomeMessage(): string {
  return [
    "This is a complete sample review based on Cramer et al. (2018) — a real systematic review and meta-analysis of yoga for anxiety.",
    "",
    "The workspace includes:",
    "- **Protocol** — Full PICO framework with search strategy across 5 databases",
    "- **Ledger** — 9 included studies and 7 excluded studies with detailed triage rationale",
    "- **Draft** — All 10 sections written (Abstract through Supplement) with inline citations",
    "- **Notes** — 8 research notes covering PRISMA flow, risk of bias, meta-analysis results, and extraction data",
    "- **Memory** — 8 project decisions and definitions guiding the review",
    "",
    "Everything is editable. Try asking:",
    "- \"Which included study had the largest sample size?\"",
    "- \"Why was Kozasa et al. (2008) excluded?\"",
    "- \"Compare the effect sizes for waitlist vs. active comparator studies\"",
    "- \"What are the main limitations of this review?\"",
    "- \"Suggest improvements to the Discussion section\"",
  ].join("\n");
}

/* ---------------------------------------------------------------------------
 * SEED / RESET LOGIC (unchanged structure)
 * -------------------------------------------------------------------------*/

async function deleteDemoProjectSideData(tx: Prisma.TransactionClient): Promise<void> {
  // AIConversation, AgentRun, MemoryRetrieval, MemoryEmbedding, AutonomyConfig
  // are now FK-cascaded from Project — no manual cleanup needed.
  // AIUsage uses SET NULL (preserves analytics), so delete explicitly for clean demo reset.
  await tx.aIUsage.deleteMany({ where: { projectId: DEMO_PROJECT_ID } });
}

async function seedDemoProject(scope: ServiceScope, reset: boolean): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existingProject = await tx.project.findFirst({
      where: {
        id: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        ownerId: scope.ownerId,
      },
      select: { id: true },
    });

    if (!reset && existingProject) {
      return;
    }

    await deleteDemoProjectSideData(tx);

    if (existingProject) {
      await tx.project.delete({ where: { id: DEMO_PROJECT_ID } });
    }

    await tx.project.create({
      data: {
        id: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        ownerId: scope.ownerId,
        name: DEMO_PROJECT_NAME,
        description: DEMO_PROJECT_DESCRIPTION,
        status: "ready",
        statusText: DEMO_PROJECT_STATUS_TEXT,
        papers: DEMO_PROJECT_PAPERS,
      },
    });

    await tx.protocol.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        data: toJsonValue(DEMO_PROTOCOL),
      },
    });

    await tx.draft.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        state: toJsonValue(DEMO_DRAFT_STATE),
      },
    });

    await tx.study.createMany({
      data: DEMO_STUDIES.map((study) => ({
        id: study.id,
        projectId: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        title: study.title,
        authors: study.authors,
        year: study.year,
        status: study.status,
        quality: study.quality,
        details: toJsonValue(study.details),
      })),
    });

    await tx.fileAsset.createMany({
      data: DEMO_FILE_ASSETS.map((asset) => ({
        id: asset.id,
        projectId: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        studyId: asset.studyId,
        kind: "source",
        format: "pdf",
        filename: asset.filename,
        mimeType: "application/pdf",
        size: 250_000,
        storagePath: `external/demo/${asset.filename}`,
        publicUrl: asset.publicUrl,
      })),
    });

    await tx.note.createMany({
      data: DEMO_NOTES.map((note) => ({
        id: note.id,
        projectId: DEMO_PROJECT_ID,
        title: note.title,
        content: toJsonValue(note.content),
        tags: note.tags,
        source: note.source,
      })),
    });

    await tx.projectMemory.createMany({
      data: DEMO_PROJECT_MEMORIES.map((memory) => ({
        id: memory.id,
        projectId: DEMO_PROJECT_ID,
        type: memory.type,
        category: memory.category,
        statement: memory.statement,
        rationale: memory.rationale,
        importance: memory.importance,
        tags: [...memory.tags],
      })),
    });

    await tx.aIConversation.create({
      data: {
        id: DEMO_CONVERSATION_ID,
        userId: scope.ownerId,
        workspaceId: scope.workspaceId,
        title: "Sample walkthrough",
        context: "project",
        page: "overview",
        projectId: DEMO_PROJECT_ID,
      },
    });

    await tx.aIMessage.create({
      data: {
        conversationId: DEMO_CONVERSATION_ID,
        role: "assistant",
        content: demoWelcomeMessage(),
      },
    });
  });
}

export async function openOrCreateDemoProject(
  scopeInput: ScopeInput
): Promise<Project> {
  const scope = requireScope(scopeInput);
  await seedDemoProject(scope, false);
  const project = await getProject(scope, DEMO_PROJECT_ID);
  if (!project) {
    throw new Error("Failed to open sample project.");
  }
  return project;
}

export async function resetDemoProject(
  scopeInput: ScopeInput,
  projectId: string
): Promise<Project> {
  if (projectId.trim() !== DEMO_PROJECT_ID) {
    throw new Error("Only the sample project can be reset via this action.");
  }
  const scope = requireScope(scopeInput);
  await seedDemoProject(scope, true);
  const project = await getProject(scope, DEMO_PROJECT_ID);
  if (!project) {
    throw new Error("Failed to reset sample project.");
  }
  return project;
}
