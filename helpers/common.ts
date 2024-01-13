import { Account, Blockchain } from "@proton/vert"


export const isDebug = false // enable to printStorageDeltas

export interface TokenSymbol {
    name: string
    precision: number
}

// token symbols
export const XBTC: TokenSymbol = { name: 'XBTC', precision: 8 }
export const XETH: TokenSymbol = { name: 'XETH', precision: 8 }
export const XDOGE: TokenSymbol = { name: 'XDOGE', precision: 6 }
export const XUSDC: TokenSymbol = { name: 'XUSDC', precision: 6 }
export const XMT: TokenSymbol = { name: 'XMT', precision: 8 }
export const METAL: TokenSymbol = { name: 'METAL', precision: 8 }
export const LOAN: TokenSymbol = { name: 'LOAN', precision: 4 }
export const XMD: TokenSymbol = { name: 'XMD', precision: 6 }

export const eosio_assert = (expectedErrorMsg: string): string => {
    return `eosio_assert: ${expectedErrorMsg}`
}

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