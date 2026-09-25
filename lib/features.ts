// Features that exist in code but are deliberately not offered to users yet.

/** The conversational AI Shopping Assistant (components/ai/ai-assistant.tsx) is the last roadmap
 *  item (CLAUDE.md sections 30 and 40): it should consume reliable application data, and until
 *  then the app does not point users at it. Off, it has no navigation entry, no promo card and no
 *  "s AI" buttons; its code stays untouched. Switch this on when the AI phase starts. The receipt
 *  OCR import is a separate, owner-approved use of a model and is not affected. */
export const AI_ASSISTANT_ENABLED = false
