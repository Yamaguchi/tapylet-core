import * as tapyrus from "tapyrusjs-lib"
import { getAddressUtxos, broadcastTransaction, isTpcColorId, type Utxo } from "../api/esplora"
import { getKeyPairFromMnemonic } from "./hdwallet"
import { validateAddress } from "./address"
import { isValidAmount, isValidFeeRate, MAX_COLORED_AMOUNT } from "../utils/validation"
import {
  DUST_THRESHOLD,
  DEFAULT_FEE_RATE,
  estimateTxSize,
} from "../constants/transaction"
import { selectTpcUtxos } from "./coinSelection"

// Filter UTXOs by colorId
const filterUtxosByColorId = (utxos: Utxo[], colorId?: string): Utxo[] => {
  if (!colorId || isTpcColorId(colorId)) {
    // Return TPC (uncolored) UTXOs
    return utxos.filter(u => isTpcColorId(u.colorId))
  }
  // Return colored UTXOs with matching colorId
  return utxos.filter(u => u.colorId === colorId)
}

export interface SendResult {
  txid: string
  txHex: string
}

export interface SendOptions {
  fromAddress: string
  toAddress: string
  amount: number // in tapyrus
  mnemonic: string
  feeRate?: number
}

export const createAndSignTransaction = async (
  options: SendOptions
): Promise<SendResult> => {
  const { fromAddress, toAddress, amount, mnemonic, feeRate = DEFAULT_FEE_RATE } = options

  // Validate amount: must be a safe positive integer within range...
  if (!isValidAmount(amount)) {
    throw new Error("Invalid amount")
  }
  if (!isValidFeeRate(feeRate)) {
    throw new Error("Invalid fee rate")
  }
  // ...and at least the dust threshold.
  if (amount < DUST_THRESHOLD) {
    throw new Error(`Amount must be at least ${DUST_THRESHOLD} tapyrus`)
  }
  // Validate the recipient address before building/signing/broadcasting.
  if (!validateAddress(toAddress)) {
    throw new Error("Invalid recipient address")
  }

  // Get UTXOs (TPC only)
  const allUtxos = await getAddressUtxos(fromAddress)
  const utxos = filterUtxosByColorId(allUtxos)
  if (utxos.length === 0) {
    throw new Error("No TPC UTXOs available")
  }

  // Select UTXOs; the transaction has 2 p2pkh outputs (recipient + change)
  const { selectedUtxos, change } = selectTpcUtxos(utxos, {
    target: amount,
    feeRate,
    baseSize: estimateTxSize(0, 2),
  })

  // Get keys from mnemonic
  const { keyPair, network } = await getKeyPairFromMnemonic(mnemonic)

  // Create transaction builder
  const txb = new tapyrus.TransactionBuilder(network)
  txb.setVersion(1) // Tapyrus feature field

  // Add inputs
  for (const utxo of selectedUtxos) {
    txb.addInput(utxo.txid, utxo.vout)
  }

  // Add recipient output
  txb.addOutput(toAddress, amount)

  // Add change output if needed
  if (change > 0) {
    txb.addOutput(fromAddress, change)
  }

  // Sign all inputs
  for (let i = 0; i < selectedUtxos.length; i++) {
    txb.sign({
      prevOutScriptType: "p2pkh",
      vin: i,
      keyPair,
    })
  }

  // Build and extract
  const tx = txb.build()
  const txHex = tx.toHex()

  // Broadcast
  const txid = await broadcastTransaction(txHex)

  return { txid, txHex }
}

// Estimate the fee for a TPC transfer, including any change too small to
// become its own output and therefore donated to the fee.
export const estimateFee = async (
  fromAddress: string,
  amount: number,
  feeRate: number = DEFAULT_FEE_RATE
): Promise<number> => {
  if (!isValidFeeRate(feeRate)) {
    throw new Error("Invalid fee rate")
  }
  const allUtxos = await getAddressUtxos(fromAddress)
  const utxos = filterUtxosByColorId(allUtxos)
  const { fee } = selectTpcUtxos(utxos, {
    target: amount,
    feeRate,
    baseSize: estimateTxSize(0, 2),
  })
  return fee
}

export interface AssetSendOptions {
  fromAddress: string
  toAddress: string
  amount: number
  colorId: string
  mnemonic: string
  feeRate?: number
}

export interface BurnOptions {
  fromAddress: string
  amount: number
  colorId: string
  mnemonic: string
  feeRate?: number
}

const selectAssetUtxos = (
  assetUtxos: Utxo[],
  targetAmount: number
): { selectedUtxos: Utxo[]; totalInput: number } => {
  const sortedUtxos = [...assetUtxos].sort((a, b) => b.value - a.value)

  const selectedUtxos: Utxo[] = []
  let totalInput = 0

  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo)
    totalInput += utxo.value

    if (totalInput >= targetAmount) {
      return { selectedUtxos, totalInput }
    }
  }

  throw new Error("Insufficient asset balance")
}

// Internal options for asset transactions (transfer or burn)
interface AssetTransactionInternalOptions {
  fromAddress: string
  toAddress?: string // undefined for burn
  amount: number
  colorId: string
  mnemonic: string
  feeRate: number
}

// Internal function for both asset transfer and burn
const createAssetTransactionInternal = async (
  options: AssetTransactionInternalOptions
): Promise<SendResult> => {
  const { fromAddress, toAddress, amount, colorId, mnemonic, feeRate } = options
  const isBurn = !toAddress

  if (!isValidAmount(amount, MAX_COLORED_AMOUNT) || amount <= 0) {
    throw new Error("Amount must be greater than 0")
  }
  if (!isValidFeeRate(feeRate)) {
    throw new Error("Invalid fee rate")
  }
  // Validate the recipient address for transfers (burn has no recipient).
  if (!isBurn && !validateAddress(toAddress)) {
    throw new Error("Invalid recipient address")
  }

  // Get all UTXOs
  const allUtxos = await getAddressUtxos(fromAddress)

  // Filter asset UTXOs
  const assetUtxos = filterUtxosByColorId(allUtxos, colorId)
  if (assetUtxos.length === 0) {
    throw new Error("No asset UTXOs available")
  }

  // Filter TPC UTXOs for fee
  const tpcUtxos = filterUtxosByColorId(allUtxos)
  if (tpcUtxos.length === 0) {
    throw new Error("No TPC UTXOs available for fee")
  }

  // Select asset UTXOs
  const { selectedUtxos: selectedAssetUtxos, totalInput: totalAssetInput } =
    selectAssetUtxos(assetUtxos, amount)

  const assetChange = totalAssetInput - amount

  // Colored outputs: recipient (transfer only) + asset change (if any)
  const coloredOutputs = (isBurn ? 0 : 1) + (assetChange > 0 ? 1 : 0)

  // Size of the transaction excluding the TPC inputs selected below:
  // asset inputs + colored outputs + 1 p2pkh output for TPC change.
  const baseSize = estimateTxSize(selectedAssetUtxos.length, 1, coloredOutputs)

  // Select TPC UTXOs for fee. The TPC inputs pay no output other than change,
  // so the target is 0. A burn with no asset change has no colored output,
  // which leaves the TPC change as the only output: it must then exist.
  const { selectedUtxos: selectedTpcUtxos, change: tpcChange } = selectTpcUtxos(
    tpcUtxos,
    {
      target: 0,
      feeRate,
      baseSize,
      minChange: coloredOutputs === 0 ? DUST_THRESHOLD : undefined,
    }
  )

  // Get keys from mnemonic
  const { keyPair, network } = await getKeyPairFromMnemonic(mnemonic)

  // Create transaction builder
  const txb = new tapyrus.TransactionBuilder(network)
  txb.setVersion(1)

  // Decode from address to get pubkey hash for scripts
  const fromAddressDecoded = tapyrus.address.fromBase58Check(fromAddress)
  const colorIdBuffer = Buffer.from(colorId, "hex")

  // Create prevOutScript for colored inputs
  const coloredPrevOutScript = tapyrus.payments.cp2pkh({
    colorId: colorIdBuffer,
    hash: fromAddressDecoded.hash,
    network,
  }).output!

  // Add asset inputs first (with prevOutScript)
  for (const utxo of selectedAssetUtxos) {
    txb.addInput(utxo.txid, utxo.vout, undefined, coloredPrevOutScript)
  }

  // Add TPC inputs for fee
  for (const utxo of selectedTpcUtxos) {
    txb.addInput(utxo.txid, utxo.vout)
  }

  // Add asset output to recipient (only for transfer)
  if (!isBurn) {
    const toAddressDecoded = tapyrus.address.fromBase58Check(toAddress)
    const recipientScript = tapyrus.payments.cp2pkh({
      colorId: colorIdBuffer,
      hash: toAddressDecoded.hash,
      network,
    }).output!
    txb.addOutput(recipientScript, amount)
  }

  // Add asset change output if needed
  if (assetChange > 0) {
    const changeScript = tapyrus.payments.cp2pkh({
      colorId: colorIdBuffer,
      hash: fromAddressDecoded.hash,
      network,
    }).output!
    txb.addOutput(changeScript, assetChange)
  }

  // Add TPC change output if needed
  if (tpcChange > 0) {
    txb.addOutput(fromAddress, tpcChange)
  }

  // Sign all inputs
  const totalInputs = selectedAssetUtxos.length + selectedTpcUtxos.length
  for (let i = 0; i < totalInputs; i++) {
    txb.sign({
      prevOutScriptType: i < selectedAssetUtxos.length ? "cp2pkh" : "p2pkh",
      vin: i,
      keyPair,
    })
  }

  // Build and extract
  const tx = txb.build()
  const txHex = tx.toHex()

  // Broadcast
  const txid = await broadcastTransaction(txHex)

  return { txid, txHex }
}

export const createAndSignAssetTransaction = async (
  options: AssetSendOptions
): Promise<SendResult> => {
  const { feeRate = DEFAULT_FEE_RATE, ...rest } = options
  return createAssetTransactionInternal({ ...rest, feeRate })
}

export const burnAsset = async (
  options: BurnOptions
): Promise<SendResult> => {
  const { feeRate = DEFAULT_FEE_RATE, ...rest } = options
  return createAssetTransactionInternal({ ...rest, feeRate })
}
