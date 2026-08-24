import { createAndSignTransaction, createAndSignAssetTransaction, burnAsset, estimateFee } from '~/core/wallet/transaction'
import { estimateTxSize, DEFAULT_FEE_RATE, DUST_THRESHOLD, P2PKH_INPUT_SIZE } from '~/core/constants/transaction'
import { MAX_FEE_RATE } from '~/core/utils/validation'
import * as tapyrus from 'tapyrusjs-lib'
import * as esplora from '~/core/api/esplora'
import * as hdwallet from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC, TEST_ADDRESS, TEST_RECIPIENT, mockKeyPairWithNetwork } from '../../helpers/mockWallet'

// Mock the modules
jest.mock('~/core/api/esplora')
jest.mock('~/core/wallet/hdwallet')

const mockedEsplora = esplora as jest.Mocked<typeof esplora>
const mockedHdwallet = hdwallet as jest.Mocked<typeof hdwallet>

describe('transaction', () => {
  const testMnemonic = TEST_MNEMONIC
  const testAddress = TEST_ADDRESS
  const testRecipient = TEST_RECIPIENT
  const testColorId = 'c1ec2fd806701a3f55808cbec3922c38dafaa3070c48c803e9043ee3642c660b46'

  // Mock TPC UTXOs
  const mockTpcUtxos: esplora.Utxo[] = [
    {
      txid: 'a'.repeat(64),
      vout: 0,
      status: { confirmed: true },
      value: 100000000, // 1 TPC
      colorId: esplora.TPC_COLOR_ID,
    },
  ]

  // Mock colored UTXOs
  const mockColoredUtxos: esplora.Utxo[] = [
    {
      txid: 'b'.repeat(64),
      vout: 0,
      status: { confirmed: true },
      value: 1000,
      colorId: testColorId,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockedHdwallet.getKeyPairFromMnemonic.mockResolvedValue(mockKeyPairWithNetwork)
    mockedEsplora.broadcastTransaction.mockResolvedValue('c'.repeat(64))
  })

  describe('createAndSignTransaction', () => {
    beforeEach(() => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('should create and sign a TPC transaction', async () => {
      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000, // 0.1 TPC
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(typeof result.txHex).toBe('string')
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should throw error if amount is below dust threshold', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 100, // Below dust threshold
        mnemonic: testMnemonic,
      })).rejects.toThrow('Amount must be at least 546 tapyrus')
    })

    it('should throw error if amount is not a valid integer', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1.5, // non-integer
        mnemonic: testMnemonic,
      })).rejects.toThrow('Invalid amount')
    })

    it('should throw error if recipient address is invalid', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: 'not-a-valid-address',
        amount: 10000000,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Invalid recipient address')
    })

    it('should throw error if fee rate is below the relayable minimum', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        feeRate: 0,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should throw error if fee rate is above the absurd-fee limit', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        feeRate: MAX_FEE_RATE + 1,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should accept a fee rate at the absurd-fee limit', async () => {
      const utxos: esplora.Utxo[] = [{
        txid: 'a'.repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 1000000000,
        colorId: esplora.TPC_COLOR_ID,
      }]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000,
        mnemonic: testMnemonic,
        feeRate: MAX_FEE_RATE,
      })

      // tapyrusjs-lib refuses to build above 2500 tapyrus/byte, so the limit
      // has to stay below that for a transaction at the limit to be buildable
      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const outTotal = tx.outs.reduce((sum, out) => sum + out.value, 0)
      expect(utxos[0].value - outTotal).toBe(estimateTxSize(1, 2) * MAX_FEE_RATE)
    })

    it('should throw error if no TPC UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([])

      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No TPC UTXOs available')
    })

    it('should throw error if insufficient funds', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 200000000, // 2 TPC, more than available
        mnemonic: testMnemonic,
      })).rejects.toThrow('Insufficient funds')
    })
  })

  describe('createAndSignAssetTransaction', () => {
    beforeEach(() => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([...mockTpcUtxos, ...mockColoredUtxos])
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('should create and sign an asset transfer transaction', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should throw error if amount is zero or negative', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 0,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if recipient address is invalid', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: 'not-a-valid-address',
        amount: 100,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Invalid recipient address')
    })

    it('should throw error if no asset UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos) // Only TPC, no colored

      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No asset UTXOs available')
    })

    it('should throw error if no TPC UTXOs for fee', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockColoredUtxos) // Only colored, no TPC

      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No TPC UTXOs available for fee')
    })

    it('should throw error if insufficient asset balance', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 2000, // More than available (1000)
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Insufficient asset balance')
    })

    it('should throw error if fee rate is below the relayable minimum', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        feeRate: -1,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should throw error if fee rate is above the absurd-fee limit', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        feeRate: MAX_FEE_RATE + 1,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should include recipient colored output in transaction', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs (cp2pkh script: 0x21 + colorId(33) + 0xbc + p2pkh)
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 && // Push 33 bytes
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have at least 1 colored output (recipient)
      expect(coloredOutputs.length).toBeGreaterThanOrEqual(1)

      // Recipient output should have the transfer amount
      const recipientOutput = coloredOutputs.find(out => out.value === 500)
      expect(recipientOutput).toBeDefined()
    })

    it('should include asset change output when amount is less than total', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 300, // Less than 1000, so 700 change
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have 2 colored outputs (recipient + change)
      expect(coloredOutputs.length).toBe(2)

      // Should have recipient (300) and change (700)
      const values = coloredOutputs.map(out => out.value).sort((a, b) => a - b)
      expect(values).toEqual([300, 700])
    })
  })

  describe('burnAsset', () => {
    beforeEach(() => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([...mockTpcUtxos, ...mockColoredUtxos])
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('should create and sign a burn transaction', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should burn all tokens when amount equals balance', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // Burn all
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
    })

    it('should throw error if amount is zero or negative', async () => {
      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 0,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if no asset UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)

      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No asset UTXOs available')
    })

    it('should throw error if no TPC UTXOs for fee', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockColoredUtxos)

      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No TPC UTXOs available for fee')
    })

    it('should throw error if insufficient asset balance', async () => {
      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 2000,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Insufficient asset balance')
    })

    it('should NOT include burned amount in outputs', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 500, // Burn 500, change 500
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs (cp2pkh script: 0x21 + colorId(33) + 0xbc + p2pkh)
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have only 1 colored output (change), not 2 (no recipient)
      expect(coloredOutputs.length).toBe(1)

      // Change output should be 500 (1000 - 500 burned)
      expect(coloredOutputs[0].value).toBe(500)
    })

    it('should have no colored outputs when burning all tokens', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // Burn all
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have no colored outputs (all burned)
      expect(coloredOutputs.length).toBe(0)

      // Should still have TPC change output
      expect(tx.outs.length).toBeGreaterThanOrEqual(1)
    })

    it('should have different output count than transfer for same amount', async () => {
      // Transfer 500 (with 500 change)
      const transferResult = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      // Burn 500 (with 500 change)
      const burnResult = await burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const transferTx = tapyrus.Transaction.fromHex(transferResult.txHex)
      const burnTx = tapyrus.Transaction.fromHex(burnResult.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      const countColoredOutputs = (tx: tapyrus.Transaction) =>
        tx.outs.filter(out =>
          out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
        ).length

      // Transfer has 2 colored outputs (recipient + change)
      expect(countColoredOutputs(transferTx)).toBe(2)

      // Burn has 1 colored output (change only)
      expect(countColoredOutputs(burnTx)).toBe(1)
    })
  })

  describe('fee payment', () => {
    // TPC input total minus p2pkh output total. Colored outputs carry token
    // amounts, not TPC, so they are excluded on both sides.
    const paidTpcFee = (txHex: string, utxos: esplora.Utxo[]): number => {
      const tx = tapyrus.Transaction.fromHex(txHex)
      const byOutpoint = new Map(utxos.map(u => [`${u.txid}:${u.vout}`, u]))
      let inputTpc = 0
      for (const input of tx.ins) {
        const txid = Buffer.from(input.hash).reverse().toString('hex')
        const utxo = byOutpoint.get(`${txid}:${input.index}`)
        if (utxo && (!utxo.colorId || utxo.colorId === esplora.TPC_COLOR_ID)) {
          inputTpc += utxo.value
        }
      }
      const outputTpc = tx.outs
        .filter(out => out.script.length === 25)
        .reduce((sum, out) => sum + out.value, 0)
      return inputTpc - outputTpc
    }

    const txByteSize = (txHex: string): number => txHex.length / 2

    beforeEach(() => {
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('pays a fee covering the actual size of a TPC transaction with many inputs', async () => {
      const utxos: esplora.Utxo[] = [1, 2, 3, 4, 5].map(i => ({
        txid: String(i).repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 3000,
        colorId: esplora.TPC_COLOR_ID,
      }))
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000,
        mnemonic: testMnemonic,
      })

      const fee = paidTpcFee(result.txHex, utxos)
      const expectedFee = (estimateTxSize(0, 2) + 5 * P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
      expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
    })

    it('pays a fee covering asset inputs and colored outputs on a transfer', async () => {
      const assetUtxos: esplora.Utxo[] = ['d', 'e', 'f'].map(c => ({
        txid: c.repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 400,
        colorId: testColorId,
      }))
      const utxos = [...mockTpcUtxos, ...assetUtxos]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1000, // needs all 3 asset UTXOs, 200 asset change
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      expect(tx.ins.length).toBe(4) // 3 asset inputs + 1 TPC input

      const fee = paidTpcFee(result.txHex, utxos)
      // 3 asset inputs + 1 TPC input, 2 colored outputs, 1 TPC change output
      const expectedFee = (estimateTxSize(3, 1, 2) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
      expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
    })

    it('rounds the fee up to an integer for non-integer fee rates', async () => {
      const utxos = [...mockTpcUtxos, ...mockColoredUtxos]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      // Full transfer (no asset change): odd base size of 261 bytes
      // (1 asset input, 1 colored output, 1 TPC change output)
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1000,
        colorId: testColorId,
        mnemonic: testMnemonic,
        feeRate: 1.5,
      })

      const fee = paidTpcFee(result.txHex, utxos)
      expect(Number.isInteger(fee)).toBe(true)
      const expectedFee = Math.ceil((estimateTxSize(1, 1, 1) + P2PKH_INPUT_SIZE) * 1.5)
      expect(fee).toBe(expectedFee)
    })

    it('creates a TPC change output above dust when burning all tokens', async () => {
      const tpcUtxos: esplora.Utxo[] = [{
        txid: 'a'.repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 5000,
        colorId: esplora.TPC_COLOR_ID,
      }]
      const utxos = [...tpcUtxos, ...mockColoredUtxos]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // burn all: no colored output remains
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      // The TPC change output is the only output and must clear dust
      expect(tx.outs.length).toBe(1)
      expect(tx.outs[0].script.length).toBe(25)
      expect(tx.outs[0].value).toBeGreaterThanOrEqual(DUST_THRESHOLD)

      const fee = paidTpcFee(result.txHex, utxos)
      const expectedFee = (estimateTxSize(1, 1, 0) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
      expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
    })
  })

  describe('estimateFee', () => {
    beforeEach(() => {
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('estimates from TPC UTXOs only, ignoring colored UTXOs', async () => {
      const utxos: esplora.Utxo[] = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 20000000, // token amount, not TPC
          colorId: testColorId,
        },
        ...['d', 'e'].map(c => ({
          txid: c.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 6000000,
          colorId: esplora.TPC_COLOR_ID,
        })),
      ]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const fee = await estimateFee(testAddress, 10000000)

      // Both TPC UTXOs are needed; the colored UTXO must not be counted
      const expectedFee = (estimateTxSize(0, 2) + 2 * P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
    })

    it('throws when TPC balance is insufficient even if colored UTXOs exist', async () => {
      const utxos: esplora.Utxo[] = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 999999999, // token amount, not TPC
          colorId: testColorId,
        },
        {
          txid: 'a'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 500,
          colorId: esplora.TPC_COLOR_ID,
        },
      ]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      await expect(estimateFee(testAddress, 10000000)).rejects.toThrow('Insufficient funds')
    })
  })
})
