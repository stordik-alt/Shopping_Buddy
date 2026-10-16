// Features that exist in code but are deliberately not offered to users yet.

/** The model-backed conversational assistant remains the last roadmap item (CLAUDE.md sections 30
 *  and 40). The top-left mascot opens its UI-only chat, which clearly says that requests are not
 *  processed while no assistant model is connected. This flag controls the separate AI tab, promo
 *  card and AI buttons; it also makes the app shell reject the AI tab (including `?tab=ai`). The
 *  receipt OCR import is a separate, owner-approved use of a model and is not affected. */
export const AI_ASSISTANT_ENABLED = false
