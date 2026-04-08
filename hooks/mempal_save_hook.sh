#!/bin/bash
# MEMPALACE SAVE HOOK — Auto-save every N exchanges
# Ported to MemPalace JS

SAVE_INTERVAL=15
STATE_DIR="$HOME/.mempalace/hook_state"
mkdir -p "$STATE_DIR"

# Read JSON input from stdin
INPUT=$(cat)

# Parse fields using Node.js
PARSED=$(node -e "
try {
  const input = JSON.parse(process.argv[1]);
  console.log([
    input.session_id || 'unknown',
    input.stop_hook_active || false,
    input.transcript_path || ''
  ].join('|'))
} catch (e) {
  process.exit(1);
}
" "$INPUT" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "{}"
    exit 0
fi

SESSION_ID=$(echo "$PARSED" | cut -d'|' -f1 | tr -cd 'a-zA-Z0-9_-')
STOP_HOOK_ACTIVE=$(echo "$PARSED" | cut -d'|' -f2)
TRANSCRIPT_PATH=$(echo "$PARSED" | cut -d'|' -f3)

# Expand ~ in path
TRANSCRIPT_PATH="${TRANSCRIPT_PATH/#\~/$HOME}"

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
    echo "{}"
    exit 0
fi

# Count human messages using Node.js
if [ -f "$TRANSCRIPT_PATH" ]; then
    EXCHANGE_COUNT=$(node -e "
const fs = require('fs');
const readline = require('readline');
async function count() {
    let c = 0;
    try {
        const rl = readline.createInterface({ input: fs.createReadStream(process.argv[1]) });
        for await (const line of rl) {
            try {
                const entry = JSON.parse(line);
                if (entry.message?.role === 'user' && !entry.message.content?.includes('<command-message>')) {
                    c++;
                }
            } catch {}
        }
    } catch {}
    console.log(c);
}
count();
" "$TRANSCRIPT_PATH" 2>/dev/null)
else
    EXCHANGE_COUNT=0
fi

LAST_SAVE_FILE="$STATE_DIR/${SESSION_ID}_last_save"
LAST_SAVE=0
[ -f "$LAST_SAVE_FILE" ] && LAST_SAVE=$(cat "$LAST_SAVE_FILE")

SINCE_LAST=$((EXCHANGE_COUNT - LAST_SAVE))

echo "[$(date '+%H:%M:%S')] Session $SESSION_ID: $EXCHANGE_COUNT exchanges, $SINCE_LAST since last save" >> "$STATE_DIR/hook.log"

if [ "$SINCE_LAST" -ge "$SAVE_INTERVAL" ] && [ "$EXCHANGE_COUNT" -gt 0 ]; then
    echo "$EXCHANGE_COUNT" > "$LAST_SAVE_FILE"
    echo "[$(date '+%H:%M:%S')] TRIGGERING SAVE at exchange $EXCHANGE_COUNT" >> "$STATE_DIR/hook.log"

    cat << 'HOOKJSON'
{
  "decision": "block",
  "reason": "AUTO-SAVE checkpoint. Save key topics, decisions, quotes, and code from this session to your memory system. Organize into appropriate categories. Use verbatim quotes where possible. Continue conversation after saving."
}
HOOKJSON
else
    echo "{}"
fi
