import { Account } from '@proton/vert'

export interface TokenSymbol {
    name: string
    precision: number
}

export const getTokenAmountActionParam = (value: number, token: TokenSymbol) => {
    const amount = value.toFixed(token.precision)
    return `${amount} ${token.name}`
}

// native token symbol
export const XPR: TokenSymbol = { name: 'XPR', precision: 4 }
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

export const initContracts = async (...contracts: Array<Account>) => {
    for(const contract of contracts) {
        await contract.actions.init().send()
    }
}