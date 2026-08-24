// Maximum number of outputs a payment can be split into.
// Mirrors the Tapyrus API `split` upper bound.
export const MAX_SPLIT = 100

export const validateSplitRange = (split: number): void => {
  if (!Number.isInteger(split) || split < 1 || split > MAX_SPLIT) {
    throw new Error(`split must be an integer between 1 and ${MAX_SPLIT}`)
  }
}

// Distribute `amount` across `split` outputs. Every output gets
// floor(amount / count) and the whole remainder goes to the last output, so
// the last output can exceed the others by up to count - 1: an amount of 199
// split 100 ways yields 99 outputs of 1 and one output of 100. When
// amount < split, only `amount` outputs of 1 are created.
export const splitAmount = (amount: number, split: number): number[] => {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("amount must be a positive integer")
  }
  validateSplitRange(split)
  const count = Math.min(split, amount)
  const base = Math.floor(amount / count)
  const outputs = new Array(count - 1).fill(base)
  const last = amount - base * (count - 1)
  outputs.push(last)
  return outputs
}
