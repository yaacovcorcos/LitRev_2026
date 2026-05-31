import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = [number, number, number];

function getBlock(css: string, selector: string) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const match = css.match(pattern);
  if (!match) throw new Error(`Missing token block for ${selector}`);
  return match[1];
}

function getToken(block: string, token: string) {
  const pattern = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6});`);
  const match = block.match(pattern);
  if (!match) throw new Error(`Missing ${token}`);
  return match[1];
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string) {
  const fg = luminance(hexToRgb(foreground));
  const bg = luminance(hexToRgb(background));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme text token contrast", () => {
  it.each([
    [":root", "default light"],
    ['[data-theme="light-carbon"]', "light carbon"],
    ['[data-theme="dark"]', "dark"],
  ])("keeps --text-muted readable on --bg-body for %s", (selector, label) => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "styles/tokens.css"), "utf8");
    const block = getBlock(css, selector);
    const muted = getToken(block, "--text-muted");
    const background = getToken(block, "--bg-body");

    expect(contrast(muted, background), label).toBeGreaterThanOrEqual(4.5);
  });
});
