import { Blockchain, expectToThrow, nameToBigInt } from "@proton/vert"
import { createTestCollection, initContracts, initialAdminColEdit, transferNft } from "../common/helper.ts"
import { expect } from "chai";

/* Create Blockchain */
const blockchain = new Blockchain()

/* Deploy Contracts */
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets')
const atomicmarket = blockchain.createContract('atomicmarket', 'external/atomicmarket/atomicmarket')
const soonmarket = blockchain.createContract('soonmarket', 'soonmarket/target/soonmarket.contract')

/* Create Accounts */
const [powerofsoon, protonpunk, pixelheroes, marco] = blockchain.createAccounts('powerofsoon', 'protonpunk', 'pixelheroes', 'marco')

/* Runs before each test */
beforeEach(async () => {
  blockchain.resetTables()
  await initContracts(blockchain, atomicassets, atomicmarket)
  await initialAdminColEdit(atomicassets)
  await createTestCollection(blockchain, atomicassets, powerofsoon, marco) // minting all spot NFTs to marco
  await createTestCollection(blockchain, atomicassets, protonpunk)
  await createTestCollection(blockchain, atomicassets, pixelheroes)
})

const eosio_assert = (expectedErrorMsg: string): string => {
  return `eosio_assert: ${expectedErrorMsg}`
}

/* Tests */
describe('SoonMarket', () => {
  describe('revert paths', () => {
    it('reject with transfer of more than 1 SPOT NFT', async () => {
      await expectToThrow(
        transferNft(atomicassets, marco, soonmarket, [1099511627777, 1099511627778], 'collection zvapir55jvu4'),
        eosio_assert('only one spot can be redeemed for promotion')
      )
    })
    describe('reject with invalid memos', () => {
      it('empty memo', async () => {
        await expectToThrow(
          transferNft(atomicassets, marco, soonmarket, [1099511627777], ''),
          eosio_assert('invalid word count in memo')
        )
      })
      it('1 word only', async () => {
        await expectToThrow(
          transferNft(atomicassets, marco, soonmarket, [1099511627777], 'collection'),
          eosio_assert('invalid word count in memo')
        )
      })
      it('unknown promotion type', async () => {
        await expectToThrow(
          transferNft(atomicassets, marco, soonmarket, [1099511627777], 'offer zvapir55jvu4'),
          eosio_assert('unknown promotion type')
        )
      })
    })
    it('reject with non existing collection', async () => {
      await expectToThrow(
        transferNft(atomicassets, marco, soonmarket, [1099511627777], 'collection colnotexists'),
        eosio_assert('collection to promote not exists')
      )
    })
    it('reject if templateId not a Silver Spot', async () => {
      await expectToThrow(
        transferNft(atomicassets, pixelheroes, soonmarket, [1099511627807], 'collection 322142131552'),
        eosio_assert('invalid NFT - Silver SPOT expected')
      )
    })
  })
  describe('happy paths', () => {
    it('promotion of Cypher Gang', async () => {
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