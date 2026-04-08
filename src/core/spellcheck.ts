/**
 * spellcheck.ts — Spell-correct user messages before palace filing.
 * 
 * Ports the logic from the Python spellcheck.py, focusing on technical safeguards.
 * Since we want to avoid large external dictionary dependencies in the core,
 * this version focuses on "Technical Armor" — ensuring we don't break code/entities.
 */

// Patterns that mark a token as "don't touch this"
const HAS_DIGIT = /\d/;
const IS_CAMEL = /[A-Z][a-z]+[A-Z]/;
const IS_ALLCAPS = /^[A-Z_@#$%^&*()+=\[\]{}|<>?.:/\\]+$/;
const IS_TECHNICAL = /[-_]/;
const IS_URL = /https?:\/\/|www\.|\/Users\/|~\/|\.[a-z]{2,4}$/i;
const IS_CODE_OR_EMOJI = /[`*_#{}[\]\\]/;
const MIN_LENGTH = 4;

/**
 * Return true if this token should be left as-is.
 */
function shouldSkip(token: string, knownNames: Set<string>): boolean {
    if (token.length < MIN_LENGTH) return true;
    if (HAS_DIGIT.test(token)) return true;
    if (IS_CAMEL.test(token)) return true;
    if (IS_ALLCAPS.test(token)) return true;
    if (IS_TECHNICAL.test(token)) return true;
    if (IS_URL.test(token)) return true;
    if (IS_CODE_OR_EMOJI.test(token)) return true;
    if (knownNames.has(token.toLowerCase())) return true;
    return false;
}

/**
 * Heuristic spellcheck for user text.
 * Note: Without a full English dictionary/hunspell, this currently acts as a 
 * "Technical Safeguard" and "Normalization" layer.
 */
export function spellcheckUserText(text: string, knownNames: Set<string> = new Set()): string {
    const tokens = text.split(/(\s+)/);
    
    const processed = tokens.map(token => {
        if (!token.trim()) return token;

        // Strip trailing punctuation for checking
        const match = token.match(/^(.*?)([.,!?;:'")]+)?$/);
        if (!match) return token;
        
        const stripped = match[1];
        const punct = match[2] || '';

        if (!stripped || shouldSkip(stripped, knownNames)) {
            return token;
        }

        // In a future version, we would plug in 'nspell' or similar here
        // for genuine English word correction.
        // For now, we return it as is, but ensured it's not a technical term.
        return stripped + punct;
    });

    return processed.join('');
}

export function spellcheckTranscript(content: string, knownNames: Set<string> = new Set()): string {
    const lines = content.split('\n');
    return lines.map(line => {
        const stripped = line.trimStart();
        if (!stripped.startsWith('>')) return line;

        // '> actual message here'
        const prefixIndex = line.indexOf('>') + 1;
        const message = line.substring(prefixIndex);
        if (!message.trim()) return line;

        const corrected = spellcheckUserText(message, knownNames);
        return line.substring(0, prefixIndex) + corrected;
    }).join('\n');
}
