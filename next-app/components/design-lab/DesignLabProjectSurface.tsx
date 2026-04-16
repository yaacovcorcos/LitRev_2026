"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  type DesignLabSurfaceSlug,
  sanitizeDesignLabDensity,
  sanitizeDesignLabState,
  sanitizeDesignLabViewport,
} from "@/lib/design-lab/config";
import {
  designLabConversation,
  designLabDraftSections,
  designLabLedgerStudies,
  designLabMemoryClusters,
  designLabNotes,
  designLabProject,
  designLabProtocolBlocks,
  designLabRecentActivity,
  designLabSignals,
  designLabWorkstreams,
  getDesignLabSurfaceEyebrow,
} from "@/lib/design-lab/fixtures";
import styles from "./DesignLabProjectSurface.module.css";

type DesignLabProjectSurfaceProps = {
  surface: DesignLabSurfaceSlug;
};

export function DesignLabProjectSurface({ surface }: DesignLabProjectSurfaceProps) {
  const searchParams = useSearchParams();
  const viewport = sanitizeDesignLabViewport(searchParams.get("viewport"));
  const surfaceState = sanitizeDesignLabState(searchParams.get("state"));
  const density = sanitizeDesignLabDensity(searchParams.get("density"));
  const scenarioQuery = searchParams.toString();
  const scenarioSuffix = scenarioQuery.length > 0 ? `?${scenarioQuery}` : "";

  return (
    <div className={styles.stage}>
      <div className={styles.stageMeta}>
        <div>
          <p className={styles.stageLabel}>{getDesignLabSurfaceEyebrow(surface)}</p>
          <h2 className={styles.stageTitle}>{designLabProject.title}</h2>
          <p className={styles.stageDescription}>{designLabProject.subtitle}</p>
        </div>
        <div className={styles.stageChips}>
          <span className={styles.stageChip}>{viewport}</span>
          <span className={styles.stageChip}>{surfaceState}</span>
          <span className={styles.stageChip}>{density}</span>
        </div>
      </div>

      <div
        className={`${styles.canvas} ${styles[`canvas-${viewport}`]} ${styles[`density-${density}`]}`}
        data-surface={surface}
      >
        {surfaceState === "empty" ? <EmptySurface surface={surface} querySuffix={scenarioSuffix} /> : null}
        {surfaceState !== "empty" ? (
          <>
            <ProjectHeader surface={surface} state={surfaceState} />
            <ProjectTabs activeSurface={surface} querySuffix={scenarioSuffix} />
            <div className={styles.surfaceBody}>
              {surface === "overview" ? <OverviewSurface focused={surfaceState === "focused"} querySuffix={scenarioSuffix} /> : null}
              {surface === "conversation" ? <ConversationSurface focused={surfaceState === "focused"} /> : null}
              {surface === "ledger" ? <LedgerSurface focused={surfaceState === "focused"} /> : null}
              {surface === "draft" ? <DraftSurface focused={surfaceState === "focused"} /> : null}
              {surface === "protocol" ? <ProtocolSurface focused={surfaceState === "focused"} /> : null}
              {surface === "memory" ? <MemorySurface focused={surfaceState === "focused"} /> : null}
              {surface === "notes" ? <NotesSurface focused={surfaceState === "focused"} /> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProjectHeader({
  surface,
  state,
}: {
  surface: DesignLabSurfaceSlug;
  state: "default" | "focused";
}) {
  return (
    <header className={styles.projectHeader}>
      <div className={styles.projectHeaderCopy}>
        <p className={styles.projectEyebrow}>{getDesignLabSurfaceEyebrow(surface)}</p>
        <h3 className={styles.projectTitle}>{designLabProject.title}</h3>
        <p className={styles.projectSubtitle}>{designLabProject.reviewQuestion}</p>
      </div>
      <div className={styles.projectHeaderActions}>
        <span className={`${styles.statusPill} ${state === "focused" ? styles.statusPillWarm : ""}`}>
          {state === "focused" ? "Live editing" : designLabProject.status}
        </span>
        <button type="button" className={styles.ghostButton}>Share snapshot</button>
        <button type="button" className={styles.primaryButton}>Try new layout</button>
      </div>
    </header>
  );
}

function ProjectTabs({
  activeSurface,
  querySuffix,
}: {
  activeSurface: DesignLabSurfaceSlug;
  querySuffix: string;
}) {
  const tabs: Array<{ slug: DesignLabSurfaceSlug; label: string }> = [
    { slug: "overview", label: "Overview" },
    { slug: "conversation", label: "Conversation" },
    { slug: "ledger", label: "Ledger" },
    { slug: "draft", label: "Draft" },
    { slug: "protocol", label: "Protocol" },
    { slug: "memory", label: "Memory" },
    { slug: "notes", label: "Notes" },
  ];

  return (
    <nav className={styles.tabBar} aria-label="Mock project tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.slug}
          href={`/design/project/${tab.slug}${querySuffix}`}
          className={`${styles.tab} ${activeSurface === tab.slug ? styles.tabActive : ""}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function EmptySurface({
  surface,
  querySuffix,
}: {
  surface: DesignLabSurfaceSlug;
  querySuffix: string;
}) {
  const titleMap: Record<DesignLabSurfaceSlug, string> = {
    overview: "No project workspace yet",
    conversation: "Conversation is intentionally empty",
    ledger: "Ledger has no imported evidence yet",
    draft: "Draft workspace has not been shaped",
    protocol: "Protocol has not been defined yet",
    memory: "Memory is blank on purpose",
    notes: "No working notes yet",
  };

  return (
    <div className={styles.emptySurface}>
      <EmptyState
        icon="architecture"
        title={titleMap[surface]}
        description="Use the empty state to explore first-run hierarchy, onboarding, and calm activation patterns before any backend data exists."
        primaryAction={{ label: "Switch to active state", href: `/design/project/${surface}${buildQuerySuffix(querySuffix, "state=focused")}` }}
        secondaryAction={{ label: "Back to surface index", href: `/design${querySuffix}` }}
      />
    </div>
  );
}

function OverviewSurface({
  focused,
  querySuffix,
}: {
  focused: boolean;
  querySuffix: string;
}) {
  return (
    <div className={styles.regionStack}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.heroLabel}>Project pulse</p>
          <h4 className={styles.heroTitle}>A calm workspace for evidence-heavy decisions.</h4>
          <p className={styles.heroBody}>
            The overview should make the next move obvious without turning the project into a dashboard. Keep direction strong and chrome quiet.
          </p>
        </div>
        <div className={styles.heroAside}>
          <div className={styles.metricOrbit}>
            {designLabSignals.map((signal) => (
              <article key={signal.label} className={styles.metricCard}>
                <span className={styles.metricLabel}>{signal.label}</span>
                <strong className={styles.metricValue}>{signal.value}</strong>
                <span className={styles.metricDetail}>{signal.detail}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.contentGrid}>
        <div className={styles.cardStack}>
          <article className={styles.surfaceCard}>
            <div className={styles.surfaceCardHeader}>
              <h5>Workstreams</h5>
              <span>{focused ? "Highlight the active lane" : "Keep each lane distinct"}</span>
            </div>
            <div className={styles.workstreamGrid}>
              {designLabWorkstreams.map((workstream) => (
                <Link key={workstream.title} href={`${workstream.href}${querySuffix}`} className={styles.workstreamCard}>
                  <span className={styles.workstreamStatus}>{workstream.status}</span>
                  <strong>{workstream.title}</strong>
                  <p>{workstream.description}</p>
                </Link>
              ))}
            </div>
          </article>

          <article className={styles.surfaceCard}>
            <div className={styles.surfaceCardHeader}>
              <h5>Recent activity</h5>
              <span>Keep the feed quiet, not flashy</span>
            </div>
            <div className={styles.activityList}>
              {designLabRecentActivity.map((item) => (
                <div key={item.id} className={styles.activityRow}>
                  <span className={`material-icons-round ${styles.activityIcon}`}>{item.icon}</span>
                  <div className={styles.activityBody}>
                    <strong>{item.label}</strong>
                    <span>{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className={styles.sideRail}>
          <article className={styles.surfaceCard}>
            <div className={styles.surfaceCardHeader}>
              <h5>Design prompts</h5>
            </div>
            <ul className={styles.bulletList}>
              <li>Can the user see the next best action in under two seconds?</li>
              <li>Are the workstreams clearly unequal in priority?</li>
              <li>Does the overview feel operational rather than promotional?</li>
            </ul>
          </article>
        </aside>
      </section>
    </div>
  );
}

function buildQuerySuffix(existingSuffix: string, nextQuery: string): string {
  const params = new URLSearchParams(existingSuffix.startsWith("?") ? existingSuffix.slice(1) : existingSuffix);
  const incoming = new URLSearchParams(nextQuery);
  incoming.forEach((value, key) => {
    params.set(key, value);
  });
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

function ConversationSurface({ focused }: { focused: boolean }) {
  return (
    <div className={styles.conversationLayout}>
      <div className={styles.timelineCard}>
        <div className={styles.surfaceCardHeader}>
          <h5>Conversation timeline</h5>
          <span>{focused ? "Focused state shows active process feedback" : "Default state emphasizes clarity over motion"}</span>
        </div>
        <div className={styles.timelineList}>
          {designLabConversation.map((message) => (
            <article
              key={message.id}
              className={`${styles.timelineItem} ${
                message.speaker === "user"
                  ? styles.timelineUser
                  : message.speaker === "artifact"
                    ? styles.timelineArtifact
                    : styles.timelineAssistant
              }`}
            >
              <div className={styles.timelineMeta}>
                <strong>{message.label}</strong>
                {message.speaker === "assistant" && focused ? <span className={styles.liveBadge}>Live</span> : null}
              </div>
              <p>{message.body}</p>
              {"receipts" in message && message.receipts ? (
                <div className={styles.receiptRow}>
                  {message.receipts.map((receipt) => (
                    <span key={receipt} className={styles.receiptChip}>{receipt}</span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <div className={styles.composerCard}>
          {focused ? <div className={styles.progressStrip}>Analyzing 3 linked studies and drafting one evidence block.</div> : null}
          <div className={styles.composerBox}>
            <span className={styles.composerPlaceholder}>Ask the copilot to compare interventions, draft text, or prepare evidence notes…</span>
            <div className={styles.composerActions}>
              <button type="button" className={styles.ghostButton}>Queue follow-up</button>
              <button type="button" className={styles.primaryButton}>Send</button>
            </div>
          </div>
        </div>
      </div>

      <aside className={styles.sideRail}>
        <article className={styles.surfaceCard}>
          <div className={styles.surfaceCardHeader}>
            <h5>Context rail</h5>
          </div>
          <div className={styles.contextCard}>
            <span className={styles.contextLabel}>Pinned scope</span>
            <strong>Adult metabolic-risk cohorts only</strong>
          </div>
          <div className={styles.contextCard}>
            <span className={styles.contextLabel}>Recent capture</span>
            <strong>Mediterranean adherence and sleep efficiency</strong>
          </div>
          <div className={styles.contextCard}>
            <span className={styles.contextLabel}>Next follow-up</span>
            <strong>Inflammatory markers after current run</strong>
          </div>
        </article>
      </aside>
    </div>
  );
}

function LedgerSurface({ focused }: { focused: boolean }) {
  return (
    <div className={styles.regionStack}>
      <section className={styles.metricStrip}>
        {designLabSignals.slice(0, 3).map((signal) => (
          <article key={signal.label} className={styles.stripCard}>
            <span>{signal.label}</span>
            <strong>{signal.value}</strong>
            <small>{signal.detail}</small>
          </article>
        ))}
      </section>

      <section className={styles.contentGrid}>
        <div className={styles.surfaceCard}>
          <div className={styles.surfaceCardHeader}>
            <h5>Study queue</h5>
            <span>{focused ? "One row is visibly selected for deep review" : "Dense list with restrained emphasis"}</span>
          </div>
          <div className={styles.studyTable}>
            {designLabLedgerStudies.map((study, index) => (
              <article
                key={study.id}
                className={`${styles.studyRow} ${focused && index === 1 ? styles.studyRowActive : ""}`}
              >
                <div>
                  <strong>{study.title}</strong>
                  <p>{study.citation}</p>
                </div>
                <div className={styles.studyMeta}>
                  <span className={styles.studySignal}>{study.signal}</span>
                  <span className={styles.studyStatus}>{study.status}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className={styles.sideRail}>
          <article className={styles.surfaceCard}>
            <div className={styles.surfaceCardHeader}>
              <h5>Study preview</h5>
            </div>
            <strong className={styles.previewTitle}>{focused ? designLabLedgerStudies[1]?.title : designLabLedgerStudies[0]?.title}</strong>
            <p className={styles.previewBody}>{focused ? designLabLedgerStudies[1]?.notes : designLabLedgerStudies[0]?.notes}</p>
            <div className={styles.previewFacts}>
              <span>Outcome: Sleep efficiency</span>
              <span>Population: Adults with metabolic syndrome</span>
              <span>Action: Keep visible in synthesis comparison</span>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

function DraftSurface({ focused }: { focused: boolean }) {
  return (
    <div className={styles.editorLayout}>
      <aside className={styles.editorSidebar}>
        <article className={styles.surfaceCard}>
          <div className={styles.surfaceCardHeader}>
            <h5>Sections</h5>
          </div>
          <div className={styles.sectionList}>
            {designLabDraftSections.map((section, index) => (
              <div
                key={section.id}
                className={`${styles.sectionRow} ${focused && index === 2 ? styles.sectionRowActive : ""}`}
              >
                <strong>{section.label}</strong>
                <span>{section.state}</span>
              </div>
            ))}
          </div>
        </article>
      </aside>

      <div className={styles.editorMain}>
        <article className={styles.surfaceCard}>
          <div className={styles.surfaceCardHeader}>
            <h5>Results section</h5>
            <span>{focused ? "Evidence-linked rewrite mode" : "Steady manuscript reading mode"}</span>
          </div>
          <div className={styles.manuscriptBody}>
            <p>{designLabDraftSections[2]?.excerpt}</p>
            <p>
              Effects were strongest where intervention adherence remained visible throughout the study period. Trials that reduced adherence friction often showed clearer gains in sleep efficiency than comparator arms.
            </p>
            <blockquote className={styles.manuscriptCallout}>
              Design target: make evidence support visible without turning the editor into a dashboard.
            </blockquote>
          </div>
        </article>
      </div>

      <aside className={styles.sideRail}>
        <article className={styles.surfaceCard}>
          <div className={styles.surfaceCardHeader}>
            <h5>Evidence rail</h5>
          </div>
          <div className={styles.contextCard}>
            <span className={styles.contextLabel}>Anchor claim</span>
            <strong>Adherence-supported Mediterranean interventions show the clearest sleep-efficiency gains.</strong>
          </div>
          <div className={styles.contextCard}>
            <span className={styles.contextLabel}>Need caution</span>
            <strong>Two comparator trials rely on self-reported sleep only.</strong>
          </div>
        </article>
      </aside>
    </div>
  );
}

function ProtocolSurface({ focused }: { focused: boolean }) {
  return (
    <div className={styles.regionStack}>
      <section className={styles.protocolGrid}>
        {designLabProtocolBlocks.map((block, index) => (
          <article
            key={block.title}
            className={`${styles.surfaceCard} ${focused && index === 0 ? styles.protocolHighlight : ""}`}
          >
            <div className={styles.surfaceCardHeader}>
              <h5>{block.title}</h5>
            </div>
            {"body" in block ? <p className={styles.protocolBody}>{block.body}</p> : null}
            {"bullets" in block ? (
              <ul className={styles.bulletList}>
                {block.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function MemorySurface({ focused }: { focused: boolean }) {
  return (
    <div className={styles.regionStack}>
      <section className={styles.memoryGrid}>
        {designLabMemoryClusters.map((cluster, index) => (
          <article
            key={cluster.title}
            className={`${styles.surfaceCard} ${focused && index === 1 ? styles.memoryHighlight : ""}`}
          >
            <div className={styles.surfaceCardHeader}>
              <h5>{cluster.title}</h5>
              <span>{cluster.strength}</span>
            </div>
            <p>{cluster.detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function NotesSurface({ focused }: { focused: boolean }) {
  return (
    <div className={styles.regionStack}>
      <section className={styles.notesGrid}>
        {designLabNotes.map((note, index) => (
          <article
            key={note.id}
            className={`${styles.surfaceCard} ${focused && index === 0 ? styles.noteHighlight : ""}`}
          >
            <div className={styles.surfaceCardHeader}>
              <h5>{note.title}</h5>
              <span>{note.kind}</span>
            </div>
            <p>{note.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
