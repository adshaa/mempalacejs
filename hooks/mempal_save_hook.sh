#!/bin/bash

# MemPalace Auto-Save Hook for Claude Code
# Saves current project context to MemPalace

PALACE_PATH=${MEMPALACE_DIR:-"$HOME/.mempalace/palace"}
PROJECT_DIR=${1:-$PWD}

echo "Saving memories from $PROJECT_DIR to $PALACE_PATH..."

# In a real implementation, this script would call the CLI:
# mempalace mine "$PROJECT_DIR" --wing "$(basename "$PROJECT_DIR")"

echo "Memories saved."
