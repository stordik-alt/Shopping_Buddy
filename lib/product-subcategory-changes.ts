// Who may change a shared catalog product's subcategory, and when an administrator must agree.
//
// The catalog is shared by all households, so one household's correction reaches everyone. Households
// may move a product between subcategories freely a few times (fixing a wrong guess); a product that
// keeps being moved is disputed, and further moves wait for an administrator (owner's rule,
// 2026-09-29: more than 3 moves → approval first). The very first placement of a product that had no
// subcategory is not a move.

/** How many moves of one product apply at once; the move after that needs approval. */
export const FREE_SUBCATEGORY_MOVES = 3

/** Whether a new move of a product needs an administrator's approval, given the moves it already had. */
export function moveNeedsApproval(previousMoves: number): boolean {
  return previousMoves >= FREE_SUBCATEGORY_MOVES
}

export type CatalogChangeOutcome = 'applied' | 'pending' | 'unchanged'
