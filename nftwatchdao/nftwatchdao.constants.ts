// error messages
export const ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED: string = 'invalid token. price must be provided in native XPR';
export const ERROR_INVALID_FEE_STRUCTURE: string = 'invalid fee structure';
export const ERROR_ACCOUNT_NOT_EXISTS: string = 'account does not exist';
export const ERROR_MARKETPLACE_ALREADY_REGISTERED: string = 'marketplace already registered';
export const ERROR_INVALID_MARKETPLACE: string = 'invalid marketplace';
export const ERROR_GUARD_ALREADY_AUTHORIZED: string = 'guard already authorized';
export const ERROR_COLLECTION_NOT_EXISTS: string = 'collection not exists';
export const ERROR_COLLECTION_ALREADY_BLACKLISTED: string = 'collection already blacklisted';
export const ERROR_COLLECTION_ALREADY_REPORTED: string = 'collection already reported and waiting review';
export const ERROR_COLLECTION_NOT_BLACKLISTED: string = 'collection not blacklisted';
export const ERROR_SHIELDING_ALREADY_REQUESTED: string = 'shielding for collection already requested';
export const ERROR_COLLECTION_ALREADY_SHIELDED: string = 'collection already shielded';
export const ERROR_COLLECTION_NOT_REPORTED: string = 'collection not reported';
export const ERROR_COLLECTION_NOT_SHIELDED: string = 'collection not shielded';
export const ERROR_INVALID_SHIELDING_PRICE: string = 'XPR amount does not reflect the current shielding price';
export const ERROR_MISSING_SHIELDING_BALANCE: string = 'shielding balance missing';
export const ERROR_INSUFFICIENT_SHIELDING_BALANCE: string = 'insufficient shielding balance';
export const ERROR_SHIELDING_REQUEST_NOT_EXISTS: string = 'shielding request does not exist';
export const ERROR_UNAUTHORIZED_GUARD: string = 'guard not authorized';
export const ERROR_INVALID_CID: string = 'invalid cid - expecting ipfs hash starting with Qm or bafy';

// error missing authority
export const ERROR_MISSING_REQUIRED_AUTHORITY_NFTWATCHDAO: string = 'missing required authority nftwatchdao';

// default values
export const XPR_TOKEN_CONTRACT = 'eosio.token';
export const SHIELDING_PRICE_XPR: string = '12500.0000 XPR';
