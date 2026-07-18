# Post Type Colors & Visit Logging Implementation Plan

> **For agentic workers:** Inline execution.

**Goal:** Replace post type text tags with colored circles, add color bounce animation to post cards, and record all page visits in login_logs.

**Architecture:** All changes are in index.html (frontend), routes/system.js (backend), and admin.html (admin display).

**Tech Stack:** Native HTML/CSS/JS + Express

## Global Constraints

- No adding new dependencies
- Follow existing code patterns (SPA, inline JS/CSS)
- post.type still stored in DB — only selector UI changes
- login_logs table stays unchanged — only new type 'page_visit' added

---

### Task 1: Post type tags → colored circles

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace post-tag button HTML** — Remove SVG + text from each `.post-tag`, keep `data-tag` and `onclick`

- [ ] **Step 2: Update `.post-tag` CSS** — Change to `width:28px;height:28px;border-radius:50%;padding:0`

- [ ] **Step 3: Add card color bounce animation** — CSS `@keyframes colorPop` spring scale

### Task 2: Record all page visits

**Files:**
- Modify: `routes/system.js` — add POST /api/page-visit endpoint
- Modify: `index.html` — call /api/page-visit on page load
- Modify: `admin.html` — display 'page_visit' type in login logs

- [ ] **Step 1: Backend** — Add `POST /api/page-visit` in system.js
- [ ] **Step 2: Frontend** — Call in index.html DOMContentLoaded
- [ ] **Step 3: Admin display** — Handle 'page_visit' type in admin.html

### Task 3: Test checklist

- [ ] Write `todo.md` with precise test items
