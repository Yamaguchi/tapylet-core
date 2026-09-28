import {
  createHDWallet,
  getPublicKeyFromWIF,
  createLegacyMainnetWallet,
  getKeyPairFromLegacyMainnetWallet,
  NetworkId,
} from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC } from '../../helpers/mockWallet'

describe('hdwallet', () => {
  const testMnemonic = TEST_MNEMONIC

  describe('createHDWallet', () => {
    it('should create wallet with private key, public key, and WIF', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)

      expect(keys.privateKey).toBeInstanceOf(Uint8Array)
      expect(keys.privateKey).toHaveLength(32)
      expect(keys.publicKey).toBeInstanceOf(Uint8Array)
      expect(keys.publicKey).toHaveLength(33) // compressed
      expect(typeof keys.wif).toBe('string')
    })

    it('should generate consistent keys for same mnemonic', async () => {
      const keys1 = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const keys2 = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)

      expect(Buffer.from(keys1.privateKey).toString('hex'))
        .toBe(Buffer.from(keys2.privateKey).toString('hex'))
      expect(Buffer.from(keys1.publicKey).toString('hex'))
        .toBe(Buffer.from(keys2.publicKey).toString('hex'))
      expect(keys1.wif).toBe(keys2.wif)
    })

    it('should generate different keys for different network IDs', async () => {
      const keysTestnet = await createHDWallet(testMnemonic, NetworkId.TESTNET)
      const keysApi = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)

      expect(Buffer.from(keysTestnet.privateKey).toString('hex'))
        .not.toBe(Buffer.from(keysApi.privateKey).toString('hex'))
    })

    it('should generate different keys for different indices', async () => {
      const keys0 = await createHDWallet(testMnemonic, NetworkId.TESTNET, 0)
      const keys1 = await createHDWallet(testMnemonic, NetworkId.TESTNET, 1)

      expect(Buffer.from(keys0.privateKey).toString('hex'))
        .not.toBe(Buffer.from(keys1.privateKey).toString('hex'))
    })

    it('should generate WIF starting with K or L for the mainnet network', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      // Prod WIF (compressed) starts with 'K' or 'L'
      expect(['K', 'L']).toContain(keys.wif[0])
    })

    it('should generate WIF starting with c for the testnet network', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TESTNET)
      // Dev/testnet WIF (compressed) starts with 'c'
      expect(keys.wif[0]).toBe('c')
    })

    it('should throw for an unsupported network id', async () => {
      await expect(createHDWallet(testMnemonic, 999999)).rejects.toThrow(
        'Unsupported Tapyrus network id: 999999'
      )
    })
  })

  describe('getPublicKeyFromWIF', () => {
    it('should extract public key from WIF', async () => {
      const keys = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)
      const publicKey = getPublicKeyFromWIF(keys.wif, NetworkId.TAPYRUS_API)

      expect(publicKey).toBeInstanceOf(Uint8Array)
      expect(publicKey).toHaveLength(33)
      expect(Buffer.from(publicKey).toString('hex'))
        .toBe(Buffer.from(keys.publicKey).toString('hex'))
    })
  })

  describe('createLegacyMainnetWallet', () => {
    it('matches what createHDWallet(mnemonic, NetworkId.TESTNET) derives today', async () => {
      // The legacy formula is pinned independently of the testnet formula on
      // purpose (see wallet/hdwallet.ts), but as long as nothing has since
      // changed testnet's derivation, the raw keys must still coincide.
      const legacy = await createLegacyMainnetWallet(testMnemonic)
      const testnet = await createHDWallet(testMnemonic, NetworkId.TESTNET)

      expect(Buffer.from(legacy.privateKey).toString('hex'))
        .toBe(Buffer.from(testnet.privateKey).toString('hex'))
    })

    it('always encodes its WIF with the mainnet prefix, unlike NetworkId.TESTNET', async () => {
      const legacy = await createLegacyMainnetWallet(testMnemonic)
      expect(['K', 'L']).toContain(legacy.wif[0])
    })

    it('generates different keys for different indices', async () => {
      const keys0 = await createLegacyMainnetWallet(testMnemonic, 0)
      const keys1 = await createLegacyMainnetWallet(testMnemonic, 1)

      expect(Buffer.from(keys0.privateKey).toString('hex'))
        .not.toBe(Buffer.from(keys1.privateKey).toString('hex'))
    })
  })

  describe('getKeyPairFromLegacyMainnetWallet', () => {
    it('returns a keyPair encoded with the mainnet network', async () => {
      const { network, publicKey } = await getKeyPairFromLegacyMainnetWallet(testMnemonic)
      const legacy = await createLegacyMainnetWallet(testMnemonic)

      expect(network.wif).toBe(0x80) // prod
      expect(Buffer.from(publicKey).toString('hex'))
        .toBe(Buffer.from(legacy.publicKey).toString('hex'))
    })
  })

  describe('NetworkId', () => {
    it('should export NetworkId enum', () => {
      expect(NetworkId.TESTNET).toBe(1939510133)
      expect(NetworkId.TAPYRUS_API).toBe(15215628)
    })
  })
})
