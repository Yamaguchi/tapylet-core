// Transaction-related constants
export const DUST_THRESHOLD = 546
export const DEFAULT_FEE_RATE = 3 // tapyrus per byte

// Byte-size estimates for legacy (non-SegWit) P2PKH transactions.
// See https://en.bitcoin.it/wiki/Maximum_transaction_rate (in*148 + out*34 + 10).
export const TX_OVERHEAD = 10 // version(4) + in count(1) + out count(1) + locktime(4)
export const P2PKH_INPUT_SIZE = 148 // 32 txid + 4 vout + 1 len + ~107 scriptSig + 4 seq
export const P2PKH_OUTPUT_SIZE = 34 // 8 value + 1 len + 25 script
// A cp2pkh output additionally carries a 33-byte colorId plus OP_COLOR:
// 8 value + 1 len + 60 script = 69 bytes.
export const COLORED_OUTPUT_SIZE = 69

// Estimate the byte size of a legacy P2PKH transaction. `inputs` counts both
// p2pkh and cp2pkh inputs (their scriptSigs have the same size). `coloredOutputs`
// counts cp2pkh outputs, which are larger than plain p2pkh outputs.
export const estimateTxSize = (
  inputs: number,
  p2pkhOutputs: number,
  coloredOutputs = 0
): number =>
  TX_OVERHEAD +
  P2PKH_INPUT_SIZE * inputs +
  P2PKH_OUTPUT_SIZE * p2pkhOutputs +
  COLORED_OUTPUT_SIZE * coloredOutputs
