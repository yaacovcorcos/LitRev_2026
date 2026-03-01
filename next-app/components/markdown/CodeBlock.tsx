"use client";

import { useState, useCallback, type ReactNode, isValidElement, Children } from "react";
import type { Components } from "react-markdown";
import { CitationPreview, type CitationType } from "./CitationPreview";
import styles from "@/styles/markdown.module.css";

/** Map lowercase language tags to display names */
const LANG_DISPLAY: Record<string, string> = {
    js: "JavaScript", javascript: "JavaScript", jsx: "JavaScript",
    ts: "TypeScript", typescript: "TypeScript", tsx: "TypeScript",
    py: "Python", python: "Python",
    sql: "SQL",
    bash: "Shell", sh: "Shell", shell: "Shell", zsh: "Shell",
    json: "JSON", jsonc: "JSON",
    html: "HTML", css: "CSS", xml: "XML",
    r: "R", java: "Java",
    "c++": "C++", cpp: "C++", c: "C",
    "objective-c": "Objective-C", objc: "Objective-C",
    md: "Markdown", markdown: "Markdown",
    yaml: "YAML", yml: "YAML",
};

/** Tags that are generic/plain — allow PubMed detection to override */
const GENERIC_LANG_TAGS = new Set(["text", "plaintext", "txt"]);

const PUBMED_PATTERNS = /\[(MeSH|TIAB|Title\/Abstract|pt|Mesh|majr|au|dp)\]|pubmed\.ncbi/i;

function detectLanguage(rawLang: string | null, code: string): string {
    const lang = rawLang?.toLowerCase() ?? null;

    // Generic tags (text/plaintext/txt): allow PubMed detection to override
    if (lang && GENERIC_LANG_TAGS.has(lang)) {
        if (PUBMED_PATTERNS.test(code)) return "PubMed Query";
        return "Text";
    }

    if (lang && LANG_DISPLAY[lang]) return LANG_DISPLAY[lang];
    if (lang) return lang.charAt(0).toUpperCase() + lang.slice(1);
    if (PUBMED_PATTERNS.test(code)) return "PubMed Query";
    return "Code";
}

/** Extract text from React children (may be string, array, or nested) */
function childrenToString(children: unknown): string {
    if (typeof children === "string") return children;
    if (Array.isArray(children)) return children.map(childrenToString).join("");
    return String(children ?? "");
}

function getCitationLabel(href?: string): CitationType | null {
    if (!href) return null;
    try {
        const host = new URL(href).hostname.toLowerCase();
        if (host === "doi.org" || host === "dx.doi.org") return "DOI";
        if (host === "pubmed.ncbi.nlm.nih.gov") return "PubMed";
        return null;
    } catch {
        return null;
    }
}

function CodeBlock({ language, code }: { language: string | null; code: string }) {
    const [copied, setCopied] = useState(false);

    const displayLang = detectLanguage(language, code);
    const copyLabel = displayLang === "PubMed Query" ? "Copy query" : "Copy code";

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code).catch(console.error);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [code]);

    return (
        <div className={styles.codeBlockWrapper}>
            <div className={styles.codeBlockHeader}>
                <span className={styles.codeBlockLang}>{displayLang}</span>
                <button
                    type="button"
                    className={styles.codeBlockCopy}
                    onClick={handleCopy}
                    title={copyLabel}
                >
                    <span className="material-icons-round">
                        {copied ? "check" : "content_copy"}
                    </span>
                    {copied ? "Copied!" : copyLabel}
                </button>
            </div>
            <pre>
                <code className={language ? `language-${language}` : undefined}>
                    {code}
                </code>
            </pre>
        </div>
    );
}

/** Shared ReactMarkdown `components` override — use in both TimelineRenderer and AI page */
export const markdownComponents: Components = {
    pre: ({ children }: { children?: ReactNode }) => {
        // ReactMarkdown renders fenced blocks as <pre><code class="language-xxx">...</code></pre>
        const codeChild = Children.toArray(children).find(
            (child) => isValidElement(child) && child.type === "code"
        );

        if (isValidElement(codeChild)) {
            const className = (codeChild.props as { className?: string }).className || "";
            const match = /language-([^\s]+)/.exec(className);
            const lang = match ? match[1] : null;
            const raw = (codeChild.props as { children?: unknown }).children;
            const code = childrenToString(raw).replace(/\n$/, "");
            return <CodeBlock language={lang} code={code} />;
        }

        // Fallback: plain pre without code child
        return <pre>{children}</pre>;
    },
    a: ({ href, children, ...props }) => {
        const citationType = getCitationLabel(href);

        // Citation links get preview behavior
        if (citationType && href) {
            return (
                <CitationPreview href={href} type={citationType} anchorProps={props}>
                    {citationType}
                </CitationPreview>
            );
        }

        // Non-citation links render as normal
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
            </a>
        );
    },
};
