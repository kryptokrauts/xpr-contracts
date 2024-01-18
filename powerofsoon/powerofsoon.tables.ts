import { Table } from 'proton-tsc';
import {
    GOLD_AUCTION_START_PRICE_USD,
    ORACLES_FEED_INDEX_XPRUSD,
    SILVER_AUCTION_START_PRICE_USD,
} from './powerofsoon.constants';

@table('globals', singleton)
export class Globals extends Table {
    constructor(
        public oraclesFeedIndexXprUsd: u64 = ORACLES_FEED_INDEX_XPRUSD,
        public goldAuctStartPriceUsd: u32 = GOLD_AUCTION_START_PRICE_USD,
        public silverAuctStartPriceUsd: u32 = SILVER_AUCTION_START_PRICE_USD,
    ) {
        super();
    }
}
