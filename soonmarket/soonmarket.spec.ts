import { Blockchain, expectToThrow, nameToBigInt } from "@proton/vert"
import { createTestCollection, initContracts, initialAdminColEdit } from "../common/helper.ts"

/* Create Blockchain */
const blockchain = new Blockchain()

/* Deploy Contracts */
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets')
const atomicmarket = blockchain.createContract('atomicmarket', 'external/atomicmarket/atomicmarket')
const soonmarket = blockchain.createContract('soonmarket', 'soonmarket/target/soonmarket.contract')

/* Create Accounts */
const [powerofsoon, protonpunk] = blockchain.createAccounts('powerofsoon', 'protonpunk')

/* Runs before each test */
beforeEach(async () => {
  blockchain.resetTables()
  await initContracts(blockchain, atomicassets, atomicmarket)
  await initialAdminColEdit(atomicassets)
  await createTestCollection(blockchain, atomicassets, powerofsoon)
  await createTestCollection(blockchain, atomicassets, protonpunk)
})

const eosio_assert = (expectedErrorMsg: string): string => {
  return `eosio_assert: ${expectedErrorMsg}`
}

/* Tests */
describe('SoonMarket', () => {
  describe('revert paths', () => {
    it('reject with transfer of more than 1 SPOT NFT', async () => {
      await expectToThrow(
        atomicassets.actions.transfer([
          powerofsoon.name.toString(),
          soonmarket.name.toString(),
          [1099511627777, 1099511627778],
          'collection zvapir55jvu4'
        ]).send(`${powerofsoon.name.toString()}@active`),
        eosio_assert('only one spot can be redeemed for promotion')
      )
    })
    describe('reject with invalid memos', () => {
      it('empty memo', async () => {
        await expectToThrow(
          atomicassets.actions.transfer([
            powerofsoon.name.toString(),
            soonmarket.name.toString(),
            [1099511627777],
            ''
          ]).send(`${powerofsoon.name.toString()}@active`),
          eosio_assert('invalid word count in memo')
        )
      })
      it('1 word only', async () => {
        await expectToThrow(
          atomicassets.actions.transfer([
            powerofsoon.name.toString(),
            soonmarket.name.toString(),
            [1099511627777],
            'collection'
          ]).send(`${powerofsoon.name.toString()}@active`),
          eosio_assert('invalid word count in memo')
        )
      })
      it('unknown promotion type', async () => {
        await expectToThrow(
          atomicassets.actions.transfer([
            powerofsoon.name.toString(),
            soonmarket.name.toString(),
            [1099511627777],
            'offer zvapir55jvu4'
          ]).send(`${powerofsoon.name.toString()}@active`),
          eosio_assert('unknown promotion type')
        )
      })
    })
    it('reject with non existing collection', async () => {
      await expectToThrow(
        atomicassets.actions.transfer([
          powerofsoon.name.toString(),
          soonmarket.name.toString(),
          [1099511627777],
          'collection 322142131552' // pixelheroes is not created
        ]).send(`${powerofsoon.name.toString()}@active`),
        eosio_assert('collection to promote not exists')
      )
    })
  })
  describe('happy paths', () => {
    it('promotion of Cypher Gang', async () => {
      const silverSpotId: u64 = 1099511627777
      // const silverSpotAsset = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(silverSpotId)
      // console.log(silverSpotAsset)
      await atomicassets.actions.transfer([
        powerofsoon.name.toString(),
        soonmarket.name.toString(),
        [silverSpotId],
        'collection zvapir55jvu4'
      ]).send(`${powerofsoon.name.toString()}@active`)
      // const burnedAsset = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(silverSpotId)
      // console.log(burnedAsset)
    })
  })
})