"use client";

import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";
import type { TimelineItem } from "@/types/timeline";

function slugifyFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "conversation";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMultilineHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

export function buildTimelineMarkdown(items: TimelineItem[], title: string): string {
  const lines: string[] = [`# ${title}`, "", `Exported: ${new Date().toISOString()}`, ""];

  for (const item of items) {
    if (item.type === "user_message") {
      lines.push("## User");
      lines.push(item.content);
      lines.push("");
      continue;
    }
    if (item.type === "assistant_message") {
      lines.push("## Assistant");
      lines.push(normalizeAssistantContent(item.content).displayContent);
      lines.push("");
      continue;
    }
    if (item.type === "artifact") {
      lines.push(`## Artifact: ${item.title} (${item.artifactType}, ${item.status})`);
      lines.push("```json");
      lines.push(JSON.stringify(item.payload, null, 2));
      lines.push("```");
      lines.push("");
      continue;
    }
    if (item.type === "tool_activity") {
      const summary = item.summary ? ` — ${item.summary}` : "";
      lines.push(`- Tool ${item.toolName}: ${item.status}${summary}`);
      continue;
    }
    if (item.type === "progress") {
      const progress = item.current !== undefined && item.total !== undefined
        ? ` (${item.current}/${item.total})`
        : "";
      lines.push(`- Progress: ${item.message}${progress}`);
      continue;
    }
    if (item.type === "checkpoint") {
      lines.push(`- Checkpoint: ${item.label}`);
      continue;
    }
    if (item.type === "error") {
      lines.push(`- Error: ${item.message}`);
      continue;
    }
  }

  return lines.join("\n").trim() + "\n";
}

export function buildTimelinePrintHtml(items: TimelineItem[], title: string): string {
  const blocks: string[] = [];

  for (const item of items) {
    if (item.type === "user_message") {
      blocks.push(
        `<section class="entry user"><h2>User</h2><p>${formatMultilineHtml(item.content)}</p></section>`
      );
      continue;
    }
    if (item.type === "assistant_message") {
      blocks.push(
        `<section class="entry assistant"><h2>Assistant</h2><p>${formatMultilineHtml(normalizeAssistantContent(item.content).displayContent)}</p></section>`
      );
      continue;
    }
    if (item.type === "artifact") {
      blocks.push(
        `<section class="entry artifact"><h2>Artifact: ${escapeHtml(item.title)}</h2><p class="meta">${escapeHtml(
          `${item.artifactType} · ${item.status}`
        )}</p><pre>${escapeHtml(JSON.stringify(item.payload, null, 2))}</pre></section>`
      );
      continue;
    }
    if (item.type === "tool_activity") {
      const summary = item.summary ? ` · ${item.summary}` : "";
      blocks.push(
        `<section class="entry progress"><p>Tool: ${escapeHtml(`${item.toolName} · ${item.status}${summary}`)}</p></section>`
      );
      continue;
    }
    if (item.type === "progress") {
      const progressText = item.current !== undefined && item.total !== undefined
        ? `${item.message} (${item.current}/${item.total})`
        : item.message;
      blocks.push(`<section class="entry progress"><p>${escapeHtml(progressText)}</p></section>`);
      continue;
    }
    if (item.type === "checkpoint") {
      blocks.push(`<section class="entry checkpoint"><p>Checkpoint: ${escapeHtml(item.label)}</p></section>`);
      continue;
    }
    if (item.type === "error") {
      blocks.push(`<section class="entry error"><p>Error: ${escapeHtml(item.message)}</p></section>`);
    }
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        color: #1f2937;
        background: #ffffff;
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 28px 24px 40px;
      }
      h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.2; }
      .meta { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
      .entry {
        margin: 0 0 14px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px 14px;
        break-inside: avoid;
      }
      .entry h2 { font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; color: #6b7280; margin: 0 0 8px; }
      .entry p { margin: 0; line-height: 1.6; }
      .entry.user { background: #f9fafb; }
      .entry.assistant { background: #ffffff; }
      .entry.artifact pre {
        margin: 10px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: #f8fafc;
        border-radius: 10px;
        padding: 10px;
        font-size: 12px;
        line-height: 1.5;
      }
      .entry.progress, .entry.checkpoint { background: #fefce8; border-color: #fde68a; color: #92400e; }
      .entry.error { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
      @media print {
        main { padding: 12mm; }
        .entry { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">Exported: ${escapeHtml(new Date().toISOString())}</p>
      ${blocks.join("\n")}
    </main>
  </body>
</html>`;
}

export function buildExportBaseName(scopeName: string | null | undefined, conversationTitle: string | null | undefined): string {
  return `${slugifyFilename(scopeName ?? "global")}-${slugifyFilename(conversationTitle ?? "conversation")}`;
}

export function exportTimelineMarkdown(items: TimelineItem[], title: string, baseName: string) {
  const markdown = buildTimelineMarkdown(items, title);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${baseName}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

export function exportTimelinePdf(items: TimelineItem[], title: string) {
  const html = buildTimelinePrintHtml(items, title);
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  let hasPrinted = false;
  const triggerPrint = () => {
    if (hasPrinted || printWindow.closed) return;
    hasPrinted = true;
    printWindow.focus();
    printWindow.print();
  };
  printWindow.onload = () => {
    triggerPrint();
  };
  window.setTimeout(triggerPrint, 180);
}
