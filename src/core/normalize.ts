import * as fs from 'fs';
import * as path from 'path';

export function normalize(filepath: string): string {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    if (!content.trim()) return content;

    const lines = content.split('\n');
    let quoteCount = 0;
    for (const line of lines) {
      if (line.trim().startsWith('>')) quoteCount++;
    }

    // Already normalized text format
    if (quoteCount >= 3) {
      return content;
    }

    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.json' || ext === '.jsonl' || content.trim().startsWith('{') || content.trim().startsWith('[')) {
      const normalized = tryNormalizeJson(content);
      if (normalized) return normalized;
    }

    return content;
  } catch (e: any) {
    throw new Error(`Could not read ${filepath}: ${e}`);
  }
}

function tryNormalizeJson(content: string): string | null {
  let normalized = tryClaudeCodeJsonl(content);
  if (normalized) return normalized;

  normalized = tryCodexJsonl(content);
  if (normalized) return normalized;

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }

  normalized = tryClaudeAiJson(data);
  if (normalized) return normalized;

  normalized = tryChatgptJson(data);
  if (normalized) return normalized;

  normalized = trySlackJson(data);
  if (normalized) return normalized;

  return null;
}

function tryClaudeCodeJsonl(content: string): string | null {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const messages: [string, string][] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (typeof entry !== 'object' || !entry) continue;

      const msgType = entry.type || '';
      const message = entry.message || {};
      const text = extractContent(message.content || '');

      if ((msgType === 'human' || msgType === 'user') && text) {
        messages.push(['user', text]);
      } else if (msgType === 'assistant' && text) {
        messages.push(['assistant', text]);
      }
    } catch {
      continue;
    }
  }

  if (messages.length >= 2) {
    return messagesToTranscript(messages);
  }
  return null;
}

function tryCodexJsonl(content: string): string | null {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const messages: [string, string][] = [];
  let hasSessionMeta = false;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (typeof entry !== 'object' || !entry) continue;

      const entryType = entry.type || '';
      if (entryType === 'session_meta') {
        hasSessionMeta = true;
        continue;
      }

      if (entryType !== 'event_msg') continue;

      const payload = entry.payload || {};
      const payloadType = payload.type || '';
      const msg = payload.message;

      if (typeof msg !== 'string') continue;
      const text = msg.trim();
      if (!text) continue;

      if (payloadType === 'user_message') {
        messages.push(['user', text]);
      } else if (payloadType === 'agent_message') {
        messages.push(['assistant', text]);
      }
    } catch {
      continue;
    }
  }

  if (messages.length >= 2 && hasSessionMeta) {
    return messagesToTranscript(messages);
  }
  return null;
}

function tryClaudeAiJson(data: any): string | null {
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data.messages)) data = data.messages;
    else if (Array.isArray(data.chat_messages)) data = data.chat_messages;
  }
  
  if (!Array.isArray(data)) return null;

  if (data.length > 0 && typeof data[0] === 'object' && data[0].chat_messages) {
    const allMessages: [string, string][] = [];
    for (const convo of data) {
      if (typeof convo !== 'object') continue;
      const chatMsgs = Array.isArray(convo.chat_messages) ? convo.chat_messages : [];
      for (const item of chatMsgs) {
        if (typeof item !== 'object') continue;
        const role = item.role || '';
        const text = extractContent(item.content || '');
        if ((role === 'user' || role === 'human') && text) {
          allMessages.push(['user', text]);
        } else if ((role === 'assistant' || role === 'ai') && text) {
          allMessages.push(['assistant', text]);
        }
      }
    }
    if (allMessages.length >= 2) return messagesToTranscript(allMessages);
    return null;
  }

  const messages: [string, string][] = [];
  for (const item of data) {
    if (typeof item !== 'object' || !item) continue;
    const role = item.role || '';
    const text = extractContent(item.content || '');
    
    if ((role === 'user' || role === 'human') && text) {
      messages.push(['user', text]);
    } else if ((role === 'assistant' || role === 'ai') && text) {
      messages.push(['assistant', text]);
    }
  }

  if (messages.length >= 2) return messagesToTranscript(messages);
  return null;
}

function tryChatgptJson(data: any): string | null {
  if (typeof data !== 'object' || !data || !data.mapping) return null;
  const mapping = data.mapping;
  const messages: [string, string][] = [];

  let rootId: string | null = null;
  let fallbackRoot: string | null = null;

  for (const [nodeId, node] of Object.entries<any>(mapping)) {
    if (!node.parent) {
      if (!node.message) {
        rootId = nodeId;
        break;
      } else if (!fallbackRoot) {
        fallbackRoot = nodeId;
      }
    }
  }

  if (!rootId) rootId = fallbackRoot;

  if (rootId) {
    let currentId: string | null = rootId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node: any = mapping[currentId] || {};
      const msg = node.message;

      if (msg) {
        const role = msg.author?.role || '';
        const content = msg.content || {};
        const parts = Array.isArray(content.parts) ? content.parts : [];
        const text = parts.filter((p: any) => typeof p === 'string' && p).join(' ').trim();

        if (role === 'user' && text) {
          messages.push(['user', text]);
        } else if (role === 'assistant' && text) {
          messages.push(['assistant', text]);
        }
      }

      const children: any[] = Array.isArray(node.children) ? node.children : [];
      currentId = children.length > 0 ? children[0] : null;
    }
  }

  if (messages.length >= 2) return messagesToTranscript(messages);
  return null;
}

function trySlackJson(data: any): string | null {
  if (!Array.isArray(data)) return null;
  const messages: [string, string][] = [];
  const seenUsers: Record<string, string> = {};
  let lastRole: string | null = null;

  for (const item of data) {
    if (typeof item !== 'object' || !item || item.type !== 'message') continue;
    
    const userId = item.user || item.username || '';
    const text = (item.text || '').trim();
    if (!text || !userId) continue;

    if (!seenUsers[userId]) {
      if (Object.keys(seenUsers).length === 0) {
        seenUsers[userId] = 'user';
      } else if (lastRole === 'user') {
        seenUsers[userId] = 'assistant';
      } else {
        seenUsers[userId] = 'user';
      }
    }

    lastRole = seenUsers[userId];
    messages.push([seenUsers[userId], text]);
  }

  if (messages.length >= 2) return messagesToTranscript(messages);
  return null;
}

function extractContent(content: any): string {
  if (typeof content === 'string') return content.trim();
  
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (typeof item === 'object' && item && item.type === 'text') {
        parts.push(item.text || '');
      }
    }
    return parts.join(' ').trim();
  }

  if (typeof content === 'object' && content !== null) {
    return (content.text || '').trim();
  }

  return '';
}

function messagesToTranscript(messages: [string, string][]): string {
  const lines: string[] = [];
  let i = 0;

  while (i < messages.length) {
    const [role, text] = messages[i];
    
    if (role === 'user') {
      // Skipping spellcheck for now as it relies on an external library in Python
      lines.push(`> ${text}`);
      
      if (i + 1 < messages.length && messages[i + 1][0] === 'assistant') {
        lines.push(messages[i + 1][1]);
        i += 2;
      } else {
        i += 1;
      }
    } else {
      lines.push(text);
      i += 1;
    }
    lines.push('');
  }

  return lines.join('\n');
}
