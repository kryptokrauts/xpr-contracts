// error messages
export const ERROR_ONLY_ONE_SPOT_NFT_ALLOWED: string = 'only one spot can nft be redeemed for promotion'
export const ERROR_INVALID_WORD_COUNT: string = 'invalid word count in memo'
export const ERROR_INVALID_PROMOTION_TYPE: string = 'invalid promotion type'
export const ERROR_COLLECTION_NOT_EXISTS: string = 'collection not exists'
export const ERROR_AUCTION_NOT_EXISTS: string = 'auction not exists'
export const ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY = 'invalid promotion type - auction only allowed for gold spot'
export const ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED: string = 'invalid nft - silver spot expected'
export const ERROR_AUCTION_NOT_STARTED: string = 'auction not started yet'
export const ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION: string = 'auction expired or close to expiration'

// error missing authority
export const ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET: string = 'missing required authority soonmarket'

// hardcoded values
export const SILVER_SPOT_AUCTIONS_ENABLED = true // TODO remove once we update code for new market

// hardcoded durations in seconds
export const ONE_HOUR = 3_600
export const ONE_DAY = 86_400
export const ONE_WEEK = 604_800
export const TWO_WEEKS = 1_209_600