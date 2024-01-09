import { Blockchain } from "@proton/vert"
import { createTestCollection, initContracts, initialAdminColEdit } from "../common/helper.ts"

/* Create Blockchain */
const blockchain = new Blockchain()

/* Deploy Contracts */
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets')
const atomicmarket = blockchain.createContract('atomicmarket', 'external/atomicmarket/atomicmarket')
const nftreceiver = blockchain.createContract('nftreceiver', 'nftreceiver/target/nftreceiver.contract')

/* Create Accounts */
const [protonpunk, pixelheroes, powerofsoon] = blockchain.createAccounts('protonpunk', 'pixelheroes', 'powerofsoon')

/* Runs before each test */
beforeEach(async () => {
  blockchain.resetTables()
  await initContracts(blockchain, atomicassets, atomicmarket)
  await initialAdminColEdit(atomicassets)
  await createTestCollection(blockchain, atomicassets, protonpunk)
  await createTestCollection(blockchain, atomicassets, pixelheroes)
  await createTestCollection(blockchain, atomicassets, powerofsoon)
})

/* Tests */
describe('AtomicAssets', () => {
  it('Burn on Receive', async () => {
    console.log(nftreceiver.isContract.toString())
    console.log(atomicassets.isContract.toString())
    await nftreceiver.actions.printstorage().send()
  });
});