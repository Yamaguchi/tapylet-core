import { generateAddress, validateAddress, shortenAddress } from '~/core/wallet/address'
import { createHDWallet, NetworkId } from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC } from '../../helpers/mockWallet'

describe('address', () => {
  const testMnemonic = TEST_MNEMONIC

  describe('generateAddress', () => {
    it('should generate a valid Tapyrus address from public key', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const address = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)

      expect(typeof address).toBe('string')
      expect(address.length).toBeGreaterThan(25)
    })

    it('should generate consistent address for same public key', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const address1 = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)
      const address2 = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)

      expect(address1).toBe(address2)
    })

    it('should generate address starting with 1 for the mainnet network', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const address = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)

      // Prod P2PKH addresses start with '1'
      expect(address[0]).toBe('1')
    })

    it('should generate a different address for the same public key on testnet', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const mainnetAddress = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)
      const testnetAddress = generateAddress(keys.publicKey, NetworkId.TESTNET)

      expect(testnetAddress).not.toBe(mainnetAddress)
    })

    it('should throw error for invalid public key', () => {
      const invalidPublicKey = new Uint8Array(32) // wrong length
      expect(() => generateAddress(invalidPublicKey, NetworkId.TAPYRUS_API)).toThrow()
    })

    it('should throw for an unsupported network id', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      expect(() => generateAddress(keys.publicKey, 1)).toThrow(
        'Unsupported Tapyrus network id: 1'
      )
    })
  })

  describe('validateAddress', () => {
    it('should return true for a valid mainnet address', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const address = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)

      expect(validateAddress(address, NetworkId.TAPYRUS_API)).toBe(true)
    })

    it('should return false when the address belongs to a different network', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const address = generateAddress(keys.publicKey, NetworkId.TAPYRUS_API)

      expect(validateAddress(address, NetworkId.TESTNET)).toBe(false)
    })

    it('should return false for invalid address', () => {
      expect(validateAddress('invalid_address', NetworkId.TAPYRUS_API)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(validateAddress('', NetworkId.TAPYRUS_API)).toBe(false)
    })

    it('should return false for address with invalid checksum', () => {
      // Invalid address (random string)
      expect(validateAddress('1InvalidAddressXXXXXXXXXXXXXXXXXX', NetworkId.TAPYRUS_API)).toBe(false)
    })
  })

  describe('shortenAddress', () => {
    it('should shorten address with default chars', () => {
      const address = 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhex'
      const shortened = shortenAddress(address)

      expect(shortened).toBe('mzBc4X...ztRhex')
      expect(shortened.length).toBeLessThan(address.length)
    })

    it('should shorten address with custom chars', () => {
      const address = 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhex'
      const shortened = shortenAddress(address, 4)

      expect(shortened).toBe('mzBc...Rhex')
    })

    it('should return original if address is shorter than double chars', () => {
      const shortAddress = 'abc'
      expect(shortenAddress(shortAddress, 6)).toBe(shortAddress)
    })
  })
})
