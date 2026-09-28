import * as tapyrus from "tapyrusjs-lib"

/**
 * Maps a TIP-0044 network id to the tapyrusjs-lib Network describing that
 * network's address/WIF/bip32 byte prefixes. Throws on an id this package
 * doesn't know how to encode addresses for, rather than silently picking
 * one: a wallet showing a mainnet-formatted address for an unrecognized
 * network would be indistinguishable, by anyone reading the address alone,
 * from a real mainnet address.
 */
export const networkForId = (networkId: number): tapyrus.Network => {
  switch (networkId) {
    case tapyrus.NetworkId.TAPYRUS_API:
      return tapyrus.networks.prod
    case tapyrus.NetworkId.TESTNET:
      return tapyrus.networks.dev
    default:
      throw new Error(`Unsupported Tapyrus network id: ${networkId}`)
  }
}
