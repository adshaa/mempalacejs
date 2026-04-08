# Configuration & Customization

MemPalace JS is highly configurable, allowing you to control how it routes files, detects entities, and stores data.

## 1. Project-Level Routing (`mempalace.yaml`)

You can place a `mempalace.yaml` file in the root of any project directory. When you run `mempalace mine ./`, the miner will use this file to determine how to organize memories.

### Schema
```yaml
# Override the wing name for this project
wing: "my-project-v2"

# Define custom rooms and keywords for file routing
rooms:
  - name: "security"
    keywords: ["auth", "login", "encryption", "permission", "oauth"]
  - name: "ui-engine"
    keywords: ["react", "component", "styling", "tailwind", "css"]
  - name: "database"
    keywords: ["schema", "migration", "sql", "postgres", "prisma"]
```

**How it works:**
The miner checks the file path and content for these keywords. If a match is found, the file's chunks are stored in that specific room. Otherwise, it falls back to default rooms like `backend`, `frontend`, or `general`.

---

## 2. Global Configuration (`config.json`)

The global configuration is stored at `~/.mempalace/config.json`.

```json
{
  "palace_path": "/Users/name/.mempalace/palace",
  "collection_name": "mempalace_drawers",
  "topic_wings": ["emotions", "technical", "identity", "family"],
  "hall_keywords": {
    "technical": ["code", "python", "bug", "error", "api"]
  }
}
```

- `palace_path`: Where the LanceDB and SQLite files are stored.
- `collection_name`: The name of the vector table in LanceDB.
- `topic_wings`: Default wings suggested during various operations.

---

## 3. Entity Registry (`entity_registry.json`)

Located at `~/.mempalace/entity_registry.json`, this file acts as the system's "Common Sense" about people and projects you interact with.

```json
{
  "people": {
    "Alice": {
      "name": "Alice",
      "type": "person",
      "confidence": 1.0,
      "source": "onboarding",
      "aliases": ["Ali", "A-Team"]
    }
  },
  "projects": ["MemPalace", "ProjectX"],
  "wiki_cache": { ... }
}
```

- **Disambiguation:** If you have a friend named "Will" (which is also a common English word), the registry marks it as an ambiguous entity to ensure the heuristic extractor doesn't misidentify every use of the word "will" as a person.
- **Aliases:** You can manually add aliases here if the system isn't picking up a nickname.

---

## 4. Environment Variables

You can override certain settings via environment variables:

- `MEMPALACE_PALACE_PATH`: Set a custom path for the palace data.
- `MEMPALACE_LOG_LEVEL`: Control the verbosity of the CLI (e.g., `debug`).
