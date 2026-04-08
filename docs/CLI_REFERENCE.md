# CLI Reference Guide

MemPalace JS provides a robust command-line interface for managing your Memory Palace. This guide covers every command and option available.

## Global Options

- `-V, --version`: Output the version number.
- `-h, --help`: Display help for command.

---

## Commands

### `init [dir]`
Initializes a new Memory Palace.

- **Arguments:**
  - `dir` (optional): The directory where the palace data should be stored. Defaults to `~/.mempalace/palace`.
- **Description:**
  Runs an interactive onboarding flow if no directory is provided. This flow helps you bootstrap your "Identity" (L0 memory) and define initial people and projects for the Entity Registry.

### `mine <dir>`
Scan and index data from a directory into the palace.

- **Arguments:**
  - `dir`: The target directory to scan.
- **Options:**
  - `--wing <name>`: Override the default wing name (defaults to the folder name).
  - `--type <type>`: Type of data to mine. Options: `code` (default) or `convo`.
- **Description:**
  - **Code Mining:** Uses `ProjectMiner` to scan source files. It respects `.gitignore` and uses heuristics to route files to appropriate "Rooms" (e.g., `auth.ts` -> `backend`).
  - **Convo Mining:** Uses `ConvoMiner` to process chat transcripts (JSON, Markdown, etc.). It splits text into exchange pairs and extracts technical decisions and emotions.

### `search <query>`
Perform a semantic search across all memories.

- **Arguments:**
  - `query`: The natural language string to search for.
- **Description:**
  Generates a vector for your query and finds the most relevant "Drawers" in the palace using LanceDB. Results include the content, wing/room metadata, and a similarity score.

### `status`
Show the health and taxonomy of your Palace.

- **Description:**
  Displays the total number of drawers filed, the filesystem path of the palace, and a breakdown of all "Wings" and their drawer counts.

### `wake-up`
Generate high-level context for an AI agent.

- **Options:**
  - `--wing <name>`: Focus context on a specific wing.
- **Description:**
  Combines Layer 0 (Identity) and Layer 1 (Essential Story) into a single context string. Layer 1 uses AAAK dialect compression to pack the most important milestones and decisions into a small token window.

### `recall`
Retrieve specific memories (Layer 2).

- **Options:**
  - `--wing <name>`: Filter by wing.
  - `--room <name>`: Filter by room.
  - `--limit <number>`: Number of results to return (default: 10).
- **Description:**
  Useful for "Deep Dives" into specific topics without doing a full semantic search.

### `split <file>`
Handle massive transcript exports.

- **Arguments:**
  - `file`: The path to a large JSON/text export (e.g., from ChatGPT or Claude).
- **Options:**
  - `--output <dir>`: Directory to save individual session files.
- **Description:**
  Breaks down multi-session exports into individual files that are easier for the `mine` command to process accurately.

### `install-hooks`
Install shell integration for Claude Code.

- **Description:**
  Copies `mempal_save_hook.sh` and `mempal_precompact_hook.sh` to your `~/.mempalace/hooks` directory and providing the configuration commands for Claude Code.

### `mcp`
Start the Model Context Protocol server.

- **Description:**
  Runs the MCP server over `stdio`. This is the primary way for AI agents like Claude Desktop or Claude Code to interact with your memory palace as a tool-using backend.
