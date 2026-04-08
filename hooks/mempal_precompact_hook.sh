#!/bin/bash
# MEMPALACE PRE-COMPACT HOOK — Emergency save before compaction
# Ported to MemPalace JS

STATE_DIR="$HOME/.mempalace/hook_state"
mkdir -p "$STATE_DIR"

# Read JSON input from stdin
INPUT=$(cat)

# Parse session_id using Node.js
SESSION_ID=$(node -e "
try {
  const input = JSON.parse(process.argv[1]);
  console.log(input.session_id || 'unknown')
} catch (e) {
  console.log('unknown');
}
" "$INPUT" 2>/dev/null)

echo "[$(date '+%H:%M:%S')] PRE-COMPACT triggered for session $SESSION_ID" >> "$STATE_DIR/hook.log"

# Always block — compaction = save everything
cat << 'HOOKJSON'
{
  "decision": "block",
  "reason": "COMPACTION IMMINENT. Save ALL topics, decisions, quotes, code, and important context from this session to your memory system. Be thorough — after compaction, detailed context will be lost. Organize into appropriate categories. Use verbatim quotes where possible. Save everything, then allow compaction to proceed."
}
HOOKJSON
