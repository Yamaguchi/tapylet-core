import { networkForId } from '~/core/wallet/networkFormat'
import { NetworkId } from '~/core/wallet/hdwallet'

describe('networkForId', () => {
  it('maps TAPYRUS_API to the mainnet address format', () => {
    expect(networkForId(NetworkId.TAPYRUS_API).pubKeyHash).toBe(0x00)
  })

  it('maps TESTNET to the testnet address format', () => {
    expect(networkForId(NetworkId.TESTNET).pubKeyHash).toBe(0x6f)
  })

  it('throws for an unrecognized network id', () => {
    expect(() => networkForId(1)).toThrow('Unsupported Tapyrus network id: 1')
  })
})
