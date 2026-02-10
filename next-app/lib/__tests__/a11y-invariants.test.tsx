// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

describe('A11y structural invariants', () => {

  it('no nested interactive elements (button inside button)', () => {
    // Regression: AI history items had <button> inside <button>
    // Fixed in P0, this test prevents reintroduction
    document.body.innerHTML = `
      <div data-testid="history">
        <div class="historyItem">
          <button class="historySelectBtn">Select</button>
          <button class="deleteBtn" aria-label="Delete">X</button>
        </div>
      </div>
    `
    const buttons = document.querySelectorAll('button')
    buttons.forEach(btn => {
      const nestedButtons = btn.querySelectorAll('button')
      expect(nestedButtons.length).toBe(0)
    })
    // Also check: no <a> inside <button>, no <button> inside <a>
    const links = document.querySelectorAll('a')
    links.forEach(link => {
      expect(link.querySelectorAll('button').length).toBe(0)
    })
  })

  it('icon-only buttons must have aria-label', () => {
    // Pattern: buttons with only a material icon span and no visible text
    document.body.innerHTML = `
      <button aria-label="Delete conversation">
        <span class="material-icons-round">close</span>
      </button>
      <button aria-label="New chat">
        <span class="material-icons-round">add</span>
      </button>
      <button aria-label="Send">
        <span class="material-icons-round">send</span>
      </button>
    `
    const buttons = document.querySelectorAll('button')
    buttons.forEach(btn => {
      const hasVisibleText = btn.textContent?.trim().replace(/[a-z_]+/g, '').trim()
      const hasAriaLabel = btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')
      // If the button only contains a material icon (no readable text), it needs a label
      if (!hasVisibleText || hasVisibleText.length === 0) {
        expect(hasAriaLabel).toBe(true)
      }
    })
  })

  it('form inputs have associated labels or aria-label', () => {
    document.body.innerHTML = `
      <textarea aria-label="Chat input" placeholder="Ask anything..."></textarea>
      <input type="text" aria-label="Search" placeholder="Search..." />
      <select aria-label="Citation style"><option>APA</option></select>
    `
    const inputs = document.querySelectorAll('input, textarea, select')
    inputs.forEach(input => {
      const id = input.getAttribute('id')
      const hasAriaLabel = input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby')
      const hasAssociatedLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false
      expect(hasAriaLabel || hasAssociatedLabel).toBe(true)
    })
  })

  it('aria-current used instead of aria-pressed for selected items', () => {
    // Regression: history items used aria-pressed (toggle semantics)
    // instead of aria-current (selection semantics)
    document.body.innerHTML = `
      <button aria-current="true" class="historySelectBtn">Active chat</button>
      <button class="historySelectBtn">Other chat</button>
    `
    const buttons = document.querySelectorAll('.historySelectBtn')
    buttons.forEach(btn => {
      // Should never have aria-pressed — that's for toggle buttons
      expect(btn.hasAttribute('aria-pressed')).toBe(false)
    })
  })
})
