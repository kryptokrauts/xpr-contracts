import { Blockchain, expectToThrow, mintTokens, nameToBigInt } from "@proton/vert"
import { expect } from "chai";
import { LOAN, METAL, XBTC, XDOGE, XETH, XMD, XMT, XUSDC, eosio_assert, initContracts } from "../helpers/common.ts";
import { createTestCollection, initialAdminColEdit, transferNft } from "../helpers/atomicassets.helper.ts"
import { addTokens } from "../helpers/atomicmarket.helper.ts";
import { ERROR_COLLECTION_NOT_EXISTS, ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED, ERROR_INVALID_PROMOTION_TYPE, ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY, ERROR_INVALID_WORD_COUNT, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED } from "./soonmarket.constants.ts";

/* Create Blockchain */
const blockchain = new Blockchain()

/* Deploy Contracts */
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets')
const atomicmarket = blockchain.createContract('atomicmarket', 'external/atomicmarket/atomicmarket')
const xtokens = blockchain.createContract('xtokens', 'node_modules/proton-tsc/external/xtokens/xtokens')
const loanToken = blockchain.createContract('loan.token', 'node_modules/proton-tsc/external/xtokens/xtokens')
const xmdToken = blockchain.createContract('xmd.token', 'node_modules/proton-tsc/external/xtokens/xtokens')

const soonmarket = blockchain.createContract('soonmarket', 'soonmarket/target/soonmarket.contract')

/* Create Accounts */
const [powerofsoon, protonpunk, pixelheroes, marco, mitch] = blockchain.createAccounts('powerofsoon', 'protonpunk', 'pixelheroes', 'marco', 'mitch')

/* Runs before each test */
beforeEach(async () => {
  blockchain.resetTables()
  await initContracts(blockchain, atomicassets, atomicmarket)
  await initialAdminColEdit(atomicassets)
  // atomicassets
  await createTestCollection(blockchain, atomicassets, powerofsoon, marco) // minting all spot NFTs to marco
  await createTestCollection(blockchain, atomicassets, protonpunk)
  await createTestCollection(blockchain, atomicassets, pixelheroes)
  // tokens
  await mintTokens(xtokens, XBTC.name, XBTC.precision, 21000000.00000000, 5, [marco, mitch])
  await mintTokens(xtokens, XETH.name, XETH.precision, 100000000.00000000, 20, [marco, mitch])
  await mintTokens(xtokens, XDOGE.name, XDOGE.precision, 128303944202.000000, 100000, [marco, mitch])
  await mintTokens(xtokens, XUSDC.name, XUSDC.precision, 2588268654.848330, 20000, [marco, mitch])
  await mintTokens(xtokens, XMT.name, XMT.precision, 66588888.00000000, 5000, [marco, mitch])
  await mintTokens(xtokens, METAL.name, METAL.precision, 666666666.00000000, 20000, [marco, mitch])
  await mintTokens(loanToken, LOAN.name, LOAN.precision, 100000000.0000, 20000, [marco, mitch]) // how to define unlimited?
  await mintTokens(xmdToken, XMD.name, XMD.precision, 100000000.000000, 20000, [marco, mitch]) // how to define unlimited?
  // add tokens in atomicmarket config
  await addTokens(blockchain, atomicmarket, xtokens, [XBTC, XETH, XDOGE, XUSDC, XMT, METAL])
  await addTokens(blockchain, atomicmarket, loanToken, [LOAN])
  await addTokens(blockchain, atomicmarket, xmdToken, [XMD])
})

/* Tests */
describe('SoonMarket', () => {
  describe('revert paths', () => {
    it('reject with transfer of more than 1 spot nft', async () => {
      await expectToThrow(
        transferNft(atomicassets, marco, soonmarket, [1099511627777, 1099511627778], 'collection zvapir55jvu4'),
        eosio_assert(ERROR_ONLY_ONE_SPOT_NFT_ALLOWED)
      )
    })
    describe('reject with invalid memos', () => {
      it('empty memo', async () => {
        await expectToThrow(
          transferNft(atomicassets, marco, soonmarket, [1099511627777], ''),
          eosio_assert(ERROR_INVALID_WORD_COUNT)
        )
      })
      it('1 word only', async () => {
        await expectToThrow(
          transferNft(atomicassets, marco, soonmarket, [1099511627777], 'collection'),
          eosio_assert(ERROR_INVALID_WORD_COUNT)
        )
      })
      it('invalid promotion type', async () => {
        await expectToThrow(
          transferNft(atomicassets, marco, soonmarket, [1099511627777], 'offer zvapir55jvu4'),
          eosio_assert(ERROR_INVALID_PROMOTION_TYPE)
        )
      })
    })
    it('reject with non existing collection', async () => {
      await expectToThrow(
        transferNft(atomicassets, marco, soonmarket, [1099511627777], 'collection colnotexists'),
        eosio_assert(ERROR_COLLECTION_NOT_EXISTS)
      )
    })
    it('reject auction promotion with silver spot', async () => {
      await expectToThrow(
        transferNft(atomicassets, marco, soonmarket, [1099511627777], 'auction 1337'),
        eosio_assert(ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY)
      )
    })
    it('reject if templateId not a silver Spot', async () => {
      await expectToThrow(
        transferNft(atomicassets, pixelheroes, soonmarket, [1099511627807], 'collection 322142131552'),
        eosio_assert(ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED)
      )
    })
  })
  describe('happy paths', () => {
    it('promotion of Cypher Gang via silver spot', async () => {
      const silverSpotId = "1099511627777"
      // Spot NFT owned by marco
      let silverSpotAsset = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpotId)
      expect(silverSpotAsset).to.be.not.undefined
      // promote by transfering Spot NFT with valid memo to soonmarket
      await transferNft(atomicassets, marco, soonmarket, [Number(silverSpotId)], 'collection zvapir55jvu4'),
      // NFT should be owned by powerofsoon now
      silverSpotAsset = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(silverSpotId)
      expect(silverSpotAsset).to.be.not.undefined
    })
  })
})