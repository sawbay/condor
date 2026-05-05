# UI/UX Improvements Plan: Pro Trading Terminal

This document outlines the strategic plan to upgrade the existing Condor dashboard into a professional, high-performance trading bot terminal.

## Core Objectives

1. **Wire up the WebSockets (The Logic):** Connect the existing WebSocket data streams directly into the React Query cache in `BotDetail.tsx` (and relevant components). This will eliminate the reliance on 10-second polling and provide zero-latency, real-time UI updates for bot status, PnL, and new events.
2. **Build the Pro Log Terminal (The Utility):** Replace the current `<details>` log accordion with a sleek, auto-scrolling, color-coded virtualized terminal view. Traders need to instantly scan high-volume logs with ease.
3. **Apply the Pro Aesthetics (The Look):** Elevate the visual hierarchy using glassmorphism effects, glowing metrics for PnL, and high-contrast dark mode styles that resonate with professional algorithmic traders.

---

## Design Language

The new design system will pivot from a "standard SaaS dashboard" to a "Pro Trading Terminal" aesthetic.

* **Color Palette (Dark Mode First):**
  * **Backgrounds:** Deep space gray/black (e.g., `#0D1117` or `#131722`) to reduce eye strain during long sessions.
  * **Surfaces:** Translucent panels with backdrop blurs (glassmorphism) rather than flat colors, providing a sense of depth and layering.
  * **Accents (Neon/Glow):** 
    * Positive PnL/Success: Neon Green (e.g., `#00FF66`) with subtle drop-shadow glows.
    * Negative PnL/Errors: Vibrant Red (e.g., `#FF3366`) with subtle drop-shadow glows.
    * Neutral/Information: Crisp Cyan or subtle Gold.
* **Typography:**
  * **Data & Logs:** High-legibility monospace fonts (like `Fira Code`, `JetBrains Mono`, or `Roboto Mono`) for all numbers, logs, and tabular data.
  * **Headings/UI:** Modern, sleek sans-serif (like `Inter`, `Outfit`, or `Roboto`).
* **Interactivity (Micro-animations):**
  * Values updating via WebSocket should have a brief "flash" animation to draw the eye to changing data.
  * Hover states on table rows and action buttons should feel responsive but not distracting.

---

## Component Layout & Structuring

The layout will be optimized for high-density information architecture, ensuring the trader can see all critical data without excessive scrolling.

### 1. Global Overview (Bots Tab)
* **Top Metric Ribbon:** Persistent top bar displaying aggregated Total Realized PnL, Total Unrealized PnL, Total Volume, and System Health.
* **Dense Data Grids:** The bot/controller tables will use tighter padding and right-aligned numeric columns to maximize screen real estate. Use sparklines (mini charts) if applicable to show recent performance trends.

### 2. Bot Detail View (`BotDetail.tsx`)
* **Header/Control Strip:** Bot name, immediate status indicator (glowing dot), and quick-action buttons (Start, Stop, Restart) pinned to the top.
* **Split Pane Layout:**
  * **Left Pane (Metrics & Config):**
    * **Performance Cards:** Large, highly visible PnL and Volume numbers.
    * **Controller Summary:** Expandable or tightly packed list of active controllers and their specific stats.
    * **Configuration Viewer:** Read-only, syntax-highlighted YAML/JSON viewer.
  * **Right Pane (Live Activity):**
    * **The Pro Log Terminal:** Takes up significant vertical space. Fixed height with inner scrolling. Includes quick-filters (Errors, Info, Warnings) and auto-scroll-to-bottom functionality.
* **Bottom Section (Trade History):**
  * Dense table view of recent trades, color-coded by Side (Buy/Sell) and highlighting significant volume.

### 3. Deploy Bot Dialog
* Use a frosted glass overlay (backdrop-blur) to focus the user's attention.
* Multi-step or clearly categorized form inputs for configuration, ensuring it feels like a powerful tool rather than a standard web form.
