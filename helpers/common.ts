import { Account, Blockchain } from "@proton/vert"

export const isDebug = false // enable to printStorageDeltas

export const initContracts = async (blockchain: Blockchain, ...contracts: Array<Account>) => {
    blockchain.enableStorageDeltas()
    for(const contract of contracts) {
        await contract.actions.init().send()
        if (isDebug) {
            blockchain.printStorageDeltas()
        }
    }
    blockchain.disableStorageDeltas()
}