import { selectTpcUtxos } from '~/core/wallet/coinSelection'
import { TPC_COLOR_ID, type Utxo } from '~/core/api/esplora'
import {
  DUST_THRESHOLD,
  P2PKH_INPUT_SIZE,
  estimateTxSize,
} from '~/core/constants/transaction'

const utxo = (index: number, value: number): Utxo => ({
  txid: String(index).repeat(64),
  vout: 0,
  status: { confirmed: true },
  value,
  colorId: TPC_COLOR_ID,
})

// 2 p2pkh outputs (recipient + change), inputs added by the selection
const BASE_SIZE = estimateTxSize(0, 2)
const feeFor = (inputs: number, feeRate = 1): number =>
  Math.ceil((BASE_SIZE + inputs * P2PKH_INPUT_SIZE) * feeRate)

describe('selectTpcUtxos', () => {
  it('returns the leftover as change when it clears the dust threshold', () => {
    const fee = feeFor(1)
    const result = selectTpcUtxos([utxo(1, 10000 + fee + DUST_THRESHOLD)], {
      target: 10000,
      feeRate: 1,
      baseSize: BASE_SIZE,
    })

    expect(result.selectedUtxos).toHaveLength(1)
    expect(result.fee).toBe(fee)
    expect(result.change).toBe(DUST_THRESHOLD)
    expect(result.totalInput).toBe(10000 + result.fee + result.change)
  })

  it('donates a leftover below the dust threshold to the fee', () => {
    const fee = feeFor(1)
    const result = selectTpcUtxos([utxo(1, 10000 + fee + DUST_THRESHOLD - 1)], {
      target: 10000,
      feeRate: 1,
      baseSize: BASE_SIZE,
    })

    expect(result.change).toBe(0)
    expect(result.fee).toBe(fee + DUST_THRESHOLD - 1)
    expect(result.totalInput).toBe(10000 + result.fee + result.change)
  })

  it('adds inputs until the total covers the target and the fee', () => {
    const result = selectTpcUtxos([utxo(1, 4000), utxo(2, 4000), utxo(3, 4000)], {
      target: 5000,
      feeRate: 1,
      baseSize: BASE_SIZE,
    })

    expect(result.selectedUtxos).toHaveLength(2)
    expect(result.fee).toBe(feeFor(2))
  })

  it('throws with the given message when the UTXOs fall short', () => {
    expect(() =>
      selectTpcUtxos([utxo(1, 1000)], {
        target: 10000,
        feeRate: 1,
        baseSize: BASE_SIZE,
        insufficientFundsMessage: 'Insufficient TPC balance for issuance',
      })
    ).toThrow('Insufficient TPC balance for issuance')
  })

  it('defaults to "Insufficient funds" when no message is given', () => {
    expect(() =>
      selectTpcUtxos([utxo(1, 1000)], { target: 10000, feeRate: 1, baseSize: BASE_SIZE })
    ).toThrow('Insufficient funds')
  })

  describe('with minChange', () => {
    it('never donates the leftover to the fee', () => {
      // The largest UTXO alone leaves less than the dust threshold, which
      // would be donated to the fee without minChange
      const utxos = [utxo(1, feeFor(1) + DUST_THRESHOLD - 1), utxo(2, 400)]

      const result = selectTpcUtxos(utxos, {
        target: 0,
        feeRate: 1,
        baseSize: BASE_SIZE,
        minChange: DUST_THRESHOLD,
      })

      expect(result.selectedUtxos).toHaveLength(2)
      expect(result.change).toBeGreaterThanOrEqual(DUST_THRESHOLD)
    })

    it('keeps back at least the requested amount', () => {
      const result = selectTpcUtxos([utxo(1, 50000)], {
        target: DUST_THRESHOLD,
        feeRate: 1,
        baseSize: BASE_SIZE,
        minChange: 20000,
      })

      expect(result.change).toBeGreaterThanOrEqual(20000)
      expect(result.totalInput).toBe(DUST_THRESHOLD + result.fee + result.change)
    })

    it('raises a minChange below the dust threshold to it', () => {
      const utxos = [utxo(1, feeFor(1) + DUST_THRESHOLD - 1), utxo(2, 400)]

      const result = selectTpcUtxos(utxos, {
        target: 0,
        feeRate: 1,
        baseSize: BASE_SIZE,
        minChange: 1,
      })

      expect(result.selectedUtxos).toHaveLength(2)
      expect(result.change).toBeGreaterThanOrEqual(DUST_THRESHOLD)
    })

    it('throws when no combination leaves the mandatory change', () => {
      expect(() =>
        selectTpcUtxos([utxo(1, feeFor(1) + 100)], {
          target: 0,
          feeRate: 1,
          baseSize: BASE_SIZE,
          minChange: DUST_THRESHOLD,
        })
      ).toThrow('Insufficient funds')
    })
  })
})
