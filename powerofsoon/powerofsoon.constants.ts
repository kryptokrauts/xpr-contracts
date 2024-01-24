// error messages
export const ERROR_INVALID_START_PRICE: string = 'start price must be greater than 0';
export const ERROR_MARKET_BALANCE_NOT_FOUND: string = 'market balance not found';
export const ERROR_ONLY_ONE_SPOT_NFT_ALLOWED: string = 'only one spot can nft be redeemed for promotion';
export const ERROR_INVALID_ACTION: string = 'invalid action';
export const ERROR_INVALID_MEMO: string = 'invalid memo';
export const ERROR_XPRUSD_FEED_NOT_FOUND: string = 'XPR/USD feed not found';
export const ERROR_XPRUSD_WRONG_FEED_NAME: string = 'wrong feed name - expected XPR/USD';
export const ERROR_FEED_DATA_NOT_FOUND: string = 'feed data not found';
export const ERROR_AGGREGATED_PRICE_MUST_BE_POSITIVE: string = 'aggregated price must be greater than 0';
export const ERROR_SILVER_SPOT_EXPECTED: string = 'action only allowed for silver spot nft';
export const ERROR_AUCTION_NOT_EXISTS: string = 'auction not exists';
export const ERROR_AUCTION_STILL_RUNNING: string = 'auction still running';
export const ERROR_INVALID_AUCTION_SELLER: string = 'auction created by somebody else';
export const ERROR_AUCTION_HAS_BIDS: string = 'auction has bids and cannot be cancelled';
export const ERROR_INVALID_REAUCT_DURATION: string = 're-auction duration must be longer than one day';

// error missing authority
export const ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON: string = 'missing required authority powerofsoon';

// actions
export const ACTION_AUCTION = 'auction';
export const ACTION_BURN_MINT_AUCTION = 'burn_mint_auction';

// oracles feed indexes
export const ORACLES_FEED_INDEX_XPRUSD: u64 = 3;
export const ORACLES_FEED_NAME_XPRUSD: string = 'XPR/USD';

// auction default start prices in USD
export const GOLD_AUCTION_START_PRICE_USD: u32 = 30;
export const SILVER_AUCTION_START_PRICE_USD: u32 = 5;

// durations in seconds
export const ONE_HOUR: u32 = 3_600;
export const ONE_DAY: u32 = 86_400;
export const ONE_WEEK: u32 = 604_800;
export const TWO_WEEKS: u32 = 1_209_600;
