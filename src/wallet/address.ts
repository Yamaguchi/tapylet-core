import * as tapyrus from "tapyrusjs-lib"

export const generateAddress = (publicKey: Uint8Array): string => {
  const network = tapyrus.networks.prod
  const payment = tapyrus.payments.p2pkh({
    pubkey: Buffer.from(publicKey),
    network,
  })

  if (!payment.address) {
    throw new Error("Failed to generate address")
  }

  return payment.address
}

export const validateAddress = (address: string): boolean => {
  try {
    const network = tapyrus.networks.prod
    tapyrus.address.toOutputScript(address, network)
    return true
  } catch {
    return false
  }
}

// A colored address carries a colorId, so paying it yields a cp2pkh/cp2sh
// output. Only a transaction that also spends colored inputs of that colorId
// can create one, so an uncolored transfer must reject such an address.
export const isColoredAddress = (address: string): boolean => {
  try {
    return tapyrus.address.fromBase58Check(address).colorId !== undefined
  } catch {
    return false
  }
}

export const shortenAddress = (address: string, chars = 6): string => {
  if (address.length <= chars * 2) {
    return address
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}
