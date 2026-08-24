import { type Utxo } from "../api/esplora"
import { DUST_THRESHOLD, P2PKH_INPUT_SIZE, feeForSize } from "../constants/transaction"

export interface CoinSelectionOptions {
  // TPC paid out by the outputs other than change. 0 when every output of the
  // transaction is colored and the TPC inputs only pay the fee.
  target: number
  feeRate: number
  // Byte size of the transaction excluding the TPC inputs selected here:
  // overhead, the other inputs, and every output including the change output.
  baseSize: number
  // Set this when the change output must exist and hold at least this amount,
  // either because the transaction has no other output or because a later
  // transaction spends the change. The selection then never donates change to
  // the fee. Values below the dust threshold are raised to it.
  minChange?: number
  // Message for the error thrown when the UTXOs do not cover target + fee.
  insufficientFundsMessage?: string
}

export interface CoinSelection {
  selectedUtxos: Utxo[]
  totalInput: number
  fee: number
  // Amount of the change output, or 0 when the transaction has none. The
  // caller adds a change output if and only if this is greater than 0;
  // `totalInput === target + fee + change` always holds.
  change: number
}

// Select TPC UTXOs covering `target` plus the fee for the whole transaction,
// and decide how the leftover is treated. Callers pass TPC UTXOs only.
//
// Deciding the change here rather than in each caller keeps the rule in one
// place: a change output below the dust threshold cannot be created, so the
// leftover either becomes a change output or goes to the miner.
export const selectTpcUtxos = (
  utxos: Utxo[],
  options: CoinSelectionOptions
): CoinSelection => {
  const {
    target,
    feeRate,
    baseSize,
    minChange,
    insufficientFundsMessage = "Insufficient funds",
  } = options

  const requiredChange =
    minChange === undefined ? undefined : Math.max(minChange, DUST_THRESHOLD)

  // Sort UTXOs by value (largest first) for efficient selection
  const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value)

  const selectedUtxos: Utxo[] = []
  let totalInput = 0

  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo)
    totalInput += utxo.value

    const fee = feeForSize(baseSize + selectedUtxos.length * P2PKH_INPUT_SIZE, feeRate)
    const leftover = totalInput - target - fee

    if (requiredChange !== undefined) {
      if (leftover >= requiredChange) {
        return { selectedUtxos, totalInput, fee, change: leftover }
      }
      continue
    }

    if (leftover >= DUST_THRESHOLD) {
      return { selectedUtxos, totalInput, fee, change: leftover }
    }
    if (leftover >= 0) {
      // Too little for a change output, so it goes to the miner. baseSize
      // counted a change output that is not created, which makes the
      // transaction pay a little above the requested rate.
      return { selectedUtxos, totalInput, fee: fee + leftover, change: 0 }
    }
  }

  throw new Error(insufficientFundsMessage)
}
