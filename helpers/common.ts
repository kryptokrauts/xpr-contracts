// test collections
export const COLLECTION_CYPHER_GANG = 'zvapir55jvu4';
export const COLLECTION_PIXELHEROES = '322142131552';

// native token symbol
export const TOKEN_XPR: TokenSymbol = { name: 'XPR', precision: 4 };
// token symbols
export const TOKEN_XBTC: TokenSymbol = { name: 'XBTC', precision: 8 };
export const TOKEN_XETH: TokenSymbol = { name: 'XETH', precision: 8 };
export const TOKEN_XDOGE: TokenSymbol = { name: 'XDOGE', precision: 6 };
export const TOKEN_XUSDC: TokenSymbol = { name: 'XUSDC', precision: 6 };
export const TOKEN_XMT: TokenSymbol = { name: 'XMT', precision: 8 };
export const TOKEN_METAL: TokenSymbol = { name: 'METAL', precision: 8 };
export const TOKEN_LOAN: TokenSymbol = { name: 'LOAN', precision: 4 };
export const TOKEN_XMD: TokenSymbol = { name: 'XMD', precision: 6 };

export interface TokenSymbol {
    name: string;
    precision: number;
}

export const getTokenAmountActionParam = (value: number, token: TokenSymbol): string => {
    const amount = value.toFixed(token.precision);
    return `${amount} ${token.name}`;
};

export const eosio_assert = (expectedErrorMsg: string): string => {
    return `eosio_assert: ${expectedErrorMsg}`;
};
