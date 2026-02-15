/**
 * Default/mock protocol data for demo projects.
 * This provides initial data for projects that haven't been edited yet.
 */

import { ProtocolData } from "@/types/protocol";

/** Mock protocol data for the ML in Radiopathology project (p1) */
export const mockProtocolP1: ProtocolData = {
    researchQuestion: "How does AI-assisted imaging analysis compare to standard radiologist review in detecting early-stage tumors in adults, in terms of diagnostic accuracy and time to diagnosis?",
    pico: {
        population: "Adults diagnosed with early-stage tumors",
        intervention: "AI-assisted imaging analysis",
        comparison: "Standard radiologist review",
        outcome: "Detection accuracy and time to diagnosis",
    },
    eligibility: {
        inclusion: [
            "Published between 2018-2024",
            "Peer-reviewed journal articles",
            "Reports quantitative outcomes",
            "English language",
        ],
        exclusion: [
            "Conference abstracts only",
            "Case reports with n < 10",
            "Non-human subjects",
        ],
    },
    searchStrategy: {
        query: `("deep learning" OR "machine learning" OR "artificial intelligence") AND
("radiology" OR "imaging" OR "CT" OR "MRI") AND
("tumor detection" OR "cancer screening")`,
        databases: ["PubMed", "Embase", "Cochrane Library", "Web of Science"],
    },
    methodology: {
        studyDesigns: [
            "Diagnostic Accuracy Studies",
            "Retrospective Cohort Studies",
            "Prospective Cohort Studies",
        ],
        timeFrameStart: "2018",
        timeFrameEnd: "2024",
        qualityAssessmentTool: "QUADAS-2",
        qualityAssessmentNotes: "Quality Assessment of Diagnostic Accuracy Studies, version 2. Will assess patient selection, index test, reference standard, and flow/timing domains.",
    },
};

/** Mock protocol data for Climate Change project (p2) */
export const mockProtocolP2: ProtocolData = {
    researchQuestion: "What is the effectiveness of climate change adaptation strategies in urban areas compared to traditional urban planning approaches, as measured by resilience metrics, cost-effectiveness, and community outcomes?",
    pico: {
        population: "Urban areas in developed and developing countries",
        intervention: "Climate change adaptation strategies",
        comparison: "Traditional urban planning approaches",
        outcome: "Resilience metrics, cost-effectiveness, community outcomes",
    },
    eligibility: {
        inclusion: [
            "Published between 2015-2024",
            "Empirical studies with measurable outcomes",
            "Urban or peri-urban settings",
            "English, Spanish, or French language",
        ],
        exclusion: [
            "Theoretical models without validation",
            "Studies focused solely on rural areas",
            "Opinion pieces or editorials",
        ],
    },
    searchStrategy: {
        query: `("climate adaptation" OR "urban resilience" OR "climate-proof") AND
("city planning" OR "urban development" OR "infrastructure") AND
("evaluation" OR "assessment" OR "outcomes")`,
        databases: ["Scopus", "Web of Science", "Urban Studies Abstracts"],
    },
    methodology: {
        studyDesigns: [
            "Case-Control Studies",
            "Cross-sectional Studies",
            "Prospective Cohort Studies",
        ],
        timeFrameStart: "2015",
        timeFrameEnd: "2024",
        qualityAssessmentTool: "Newcastle-Ottawa Scale (NOS)",
        qualityAssessmentNotes: "Modified NOS for cross-sectional studies. Will assess selection, comparability, and outcome domains.",
    },
};

/** Mock protocol data for CRISPR project (p3) */
export const mockProtocolP3: ProtocolData = {
    researchQuestion: "What is the safety and efficacy of CRISPR-based gene therapy compared to standard pharmacological treatment in patients with neurodegenerative diseases?",
    pico: {
        population: "Patients with neurodegenerative diseases (Alzheimer's, Parkinson's, ALS)",
        intervention: "CRISPR-based gene therapy",
        comparison: "Standard pharmacological treatment or placebo",
        outcome: "Disease progression, biomarker changes, safety outcomes",
    },
    eligibility: {
        inclusion: [
            "Clinical trials (Phase I-III)",
            "Preclinical studies with translational potential",
            "Published after 2016",
            "Peer-reviewed publications",
        ],
        exclusion: [
            "In vitro studies only",
            "Non-mammalian models",
            "Conference abstracts without full publication",
        ],
    },
    searchStrategy: {
        query: `("CRISPR" OR "gene editing" OR "CRISPR-Cas9") AND
("neurodegeneration" OR "Alzheimer" OR "Parkinson" OR "ALS") AND
("therapy" OR "treatment" OR "clinical")`,
        databases: ["PubMed", "ClinicalTrials.gov", "Embase", "CENTRAL"],
    },
    methodology: {
        studyDesigns: [
            "Randomized Controlled Trials (RCTs)",
            "Non-randomized Controlled Trials",
            "Case Series",
        ],
        timeFrameStart: "2016",
        timeFrameEnd: "2024",
        qualityAssessmentTool: "Cochrane Risk of Bias 2.0 (RoB2)",
        qualityAssessmentNotes: "For RCTs. Will use ROBINS-I for non-randomized studies. Assessing randomization, deviations, missing data, measurement, and selective reporting.",
    },
};

/** Get mock protocol data for a project by ID */
export function getMockProtocolData(projectId: string): ProtocolData | null {
    switch (projectId) {
        case "p1":
            return mockProtocolP1;
        case "p2":
            return mockProtocolP2;
        case "p3":
            return mockProtocolP3;
        default:
            return null;
    }
}
