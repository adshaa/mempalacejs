# MCP Integration Guide

The Model Context Protocol (MCP) is the primary way MemPalace JS connects to AI agents.

## 1. Claude Code Setup

MemPalace JS is designed to work seamlessly with [Claude Code](https://github.com/anthropic/claude-code).

### Install the Hooks
First, ensure you have the package installed globally, or use `npx`:

**Option A: Global Install (Recommended)**
```bash
npm install -g mempalacejs
mempalace install-hooks
```

**Option B: One-time use via npx**
```bash
npx -y mempalacejs install-hooks
```

### Auto-Saving Memories
You can configure Claude Code to automatically save the conversation to MemPalace every few exchanges.

1. Install the hooks as shown above.
2. Add the `postExchangeHook` to your Claude configuration:
   ```bash
   claude config set postExchangeHook "~/.mempalace/hooks/mempal_save_hook.sh"
   ```

### Pre-Compaction Backup
Claude Code periodically "compacts" its context window. You can trigger a memory save right before this happens to ensure no information is lost:
```bash
claude config set preCompactHook "~/.mempalace/hooks/mempal_precompact_hook.sh"
```

---

## 2. Claude Desktop Setup

To give the Claude Desktop app access to your memory palace:

1. Locate your Claude Desktop configuration:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the `mempalace` server entry:
```json
{
  "mcpServers": {
    "mempalace": {
      "command": "npx",
      "args": ["-y", "mempalacejs", "mcp"]
    }
  }
}
```

3. Restart Claude Desktop. You should see a ⚡ icon (or tool list) showing the `mempalace` tools.

---

## 3. Available Tools Reference

Once connected via MCP, the agent has access to 19 tools:

| Tool Name | Purpose |
| :--- | :--- |
| `mempalace_status` | Get total drawer count and palace path. |
| `mempalace_search` | Semantic vector search for specific queries. |
| `mempalace_wake_up` | Load L0 Identity and L1 Essential Story. |
| `mempalace_recall` | Fetch verbatim drawers from a specific wing/room. |
| `mempalace_get_taxonomy` | See the full list of wings and rooms. |
| `mempalace_kg_query` | Query the relationship graph (triples) for an entity. |
| `mempalace_kg_add` | Manually add a fact to the knowledge graph. |
| `mempalace_diary_write` | Allow an agent to record its own "thoughts" in a diary wing. |
| `mempalace_traverse_graph` | Navigate connected rooms across different wings. |

---

## 4. Troubleshooting

### "Tool call timed out"
If you see timeouts in your agent, it usually means the embedding generation is taking too long. MemPalace JS uses worker threads to mitigate this, but on very slow machines, you may need to increase the timeout in your MCP client settings.

### "No results found"
Ensure you have run the `mempalace mine <dir>` command on your project first. The MCP server only reads what has been indexed into the `lancedb` folder.
