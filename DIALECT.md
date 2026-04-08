# AAAK (Asynchronous AI Abbreviated Knowledge)

AAAK is a compressed memory dialect designed for MemPalace. It allows for high-density information storage that remains readable by both humans and LLMs without needing a decoding step.

## Core Philosophy
- **No Summaries:** Store the data, not a "description" of the data.
- **Contextual Density:** Use standardized codes for entities and emotions to save tokens while preserving "vibe."
- **LLM-Friendly:** Uses structures that modern LLMs are already trained to parse (Markdown, JSON-like pipes).

## The Specification

### 1. Entity Codes
Entities (people, projects, tools) are represented by 3-letter uppercase codes.
- `ALC` = Alice
- `JOR` = Jordan
- `BEN` = Ben
- `MPJ` = MemPalace JS

### 2. Emotional Markers
Emotions are wrapped in asterisks and placed before or during the text to provide "sentiment metadata" without wordy descriptions.
- `*warm*` = Joy, tenderness, or satisfaction.
- `*fierce*` = Determination or intense focus.
- `*raw*` = Vulnerability or frustration.
- `*bloom*` = Growth or new insight.

### 3. Structure
- **Pipes (|):** Used to separate different data fields.
- **Arrows (→):** Used to show relationships or direction of action.
- **Importance (★):** A 1-5 star scale for memory weight.

### 4. Special Categories
- `FAM:` Family / Personal relationships.
- `PROJ:` Active projects or codebases.
- `⚠:` Warnings, blockers, or critical reminders.

## Example AAAK Entry

> `PROJ: MPJ | *fierce* ALC→switched to LanceDB | ★★★★ | 2026-04-09`

**Translation:**
"On project MemPalace JS, Alice determinedly switched the vector database to LanceDB. This is a high-importance milestone recorded on April 9th, 2026."

## Why use AAAK?
In a traditional RAG system, an LLM might summarize a long conversation into a paragraph. This loses the "how" and "why." In MemPalace, we use AAAK to keep the "what" and "who" perfectly intact in a fraction of the space.
