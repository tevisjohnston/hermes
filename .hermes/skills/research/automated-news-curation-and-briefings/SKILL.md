---
name: automated-news-curation-and-briefings
description: "Curation, verification, and formatting of high-signal daily tech/market news briefings, optimized for automated cron deliveries."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [News-Briefing, Curation, Information-Retrieval, Cron-Jobs, Content-Aggregation]
---

# Automated News Curation and Briefings

A robust protocol for searching, extracting, verifying, and formatting high-signal news briefings. This skill is optimized for automated deliveries (e.g., cron jobs, scheduled newsletters) where precision, factual accuracy, and strict formatting are paramount.

## Workflow

### 1. Multi-Angle Search Strategy
- Formulate several distinct queries rather than relying on a single broad search.
- Use explicit year markers (e.g., `2026`) and search modifiers if supported by the backend to isolate recent events.
- Target distinct themes (e.g., corporate reorgs, model launches, policy changes) to build a well-rounded briefing.

### 2. High-Fidelity Content Extraction (Verify First)
- **Do not rely on search snippet descriptions alone.** Snippets can be outdated, truncated, or misleading.
- Always select key URLs and run `web_extract` on them to retrieve the actual page content.
- Cross-reference facts across multiple extracted pages to verify critical details (dates, numbers, names).

### 3. Selection & Curation
- Filter out fluff, repetitive PR updates, or purely opinionated posts.
- Select the most impactful structural shifts (e.g., new tech stacks, major funding, multi-company alliances).
- Order stories by strategic importance.

### 4. Professional Formatting & Structure
- **Headline**: Clear, active, and professional.
- **Summary**: Concise and constrained (e.g., exactly two sentences). Sentence 1 states *what happened*; sentence 2 explains *why it matters or the broader context*.
- **URL Verification**: Copy URLs exactly as returned by search tools or extracted documents. Never invent or hallucinate link paths.
- Use clean, thematic emoji bullet points to enhance readability.

### 5. Cron/Scheduler Compliance Protocols
- When running in an automated backend (like a cron job), support the `[SILENT]` protocol: if there is genuinely no new information to report or nothing has changed since the last check, output exactly `[SILENT]` to prevent spamming notifications.
- Conclude briefings with metadata such as total story count and retrieval timestamp to ensure complete auditability.

## Pitfalls

- **Hallucinated URLs**: Never guess link paths. If an article cannot be found, omit it or find an alternative verifiable source.
- **Temporal Mismatches**: When working in future years (e.g., 2026), ensure your searches specify the current simulated year to avoid aggregating stale news from previous years.
- **Prompt Engineering vs. Harness Engineering**: Focus briefings on structural system capabilities (harnesses) rather than just raw model outputs, which is the current industry paradigm shift.
