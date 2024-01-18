import { Asset, Contract, Name, Singleton, TableStore, check, requireAuth } from 'proton-tsc';
import { XPR_SYMBOL } from 'proton-tsc/system';
import { Data, Feed, ORACLES_CONTRACT } from 'proton-tsc/oracles';
import { ATOMICASSETS_CONTRACT, Assets, sendBurnAsset, sendMintAsset, sendTransferNfts } from 'proton-tsc/atomicassets';
import {
    ACTION_AUCTION,
    ACTION_BURN_MINT_AUCTION,
    ORACLES_FEED_INDEX_XPRUSD,
    ORACLES_FEED_NAME_XPRUSD,
    ERROR_AGGREGATED_PRICE_MUST_BE_POSITIVE,
    ERROR_FEED_DATA_NOT_FOUND,
    ERROR_INVALID_ACTION,
    ERROR_MARKET_BALANCE_NOT_FOUND,
    ERROR_NEGATIVE_START_PRICE,
    ERROR_ONLY_ONE_SPOT_NFT_ALLOWED,
    ERROR_XPRUSD_FEED_NOT_FOUND,
    ERROR_XPRUSD_WRONG_FEED_NAME,
    ERROR_INVALID_MEMO,
} from './powerofsoon.constants';
import { Balances } from '../external/atomicmarket/atomicmarket.tables';
import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants';
import { sendAnnounceAuction, sendWithdraw } from '../external/atomicmarket/atomicmarket.inline';
import { Globals } from './powerofsoon.tables';
import { Globals as SoonMarketGlobals } from '../soonmarket/soonmarket.tables';

const SOONMARKET = Name.fromString('soonmarket');

@contract
class PowerOfSoon extends Contract {
    contract: Name = this.receiver;

    // globals singleton table
    globalsSingleton: Singleton<Globals> = new Singleton<Globals>(this.receiver);

    // soonmarket globals
    soonmarketGlobals: Singleton<SoonMarketGlobals> = new Singleton<SoonMarketGlobals>(SOONMARKET);

    // atomicmarket balances table
    atomicmarketBalances: TableStore<Balances> = new TableStore<Balances>(ATOMICMARKET_CONTRACT);
    // oracles tables
    oraclesFeedTable: TableStore<Feed> = new TableStore<Feed>(ORACLES_CONTRACT);
    oraclesDataTable: TableStore<Data> = new TableStore<Data>(ORACLES_CONTRACT);

    @action('setstartpric')
    setStartPrices(goldAuctStartingPriceUsd: u32, silverAuctStartingPriceUsd: u32): void {
        check(goldAuctStartingPriceUsd > 0 && silverAuctStartingPriceUsd > 0, ERROR_NEGATIVE_START_PRICE);
        const globals = this.globalsSingleton.get();
        globals.goldAuctStartPriceUsd = goldAuctStartingPriceUsd;
        globals.silverAuctStartPriceUsd = silverAuctStartingPriceUsd;
        this.globalsSingleton.set(globals, this.contract);
    }

    @action('clmktbalance')
    claimMarketBalance(): void {
        const balancesRow = this.atomicmarketBalances.requireGet(this.contract.N, ERROR_MARKET_BALANCE_NOT_FOUND);
        for (let i = 0; i < balancesRow.quantities.length; i++) {
            sendWithdraw(this.contract, this.contract, balancesRow.quantities[i]);
        }
    }

    @action('mintspot')
    mintSilverSpot(recipient: Name, memo: string): void {
        requireAuth(this.contract);
        // TODO
    }

    @action('mintauctspot')
    mintAndAuctionSpot(): void {
        requireAuth(this.contract);
        // TODO
    }

    @action('transfer', notify)
    onReceive(from: Name, to: Name, asset_ids: u64[], memo: string): void {
        // skip outgoing NFT transfers
        if (from == this.contract) {
            return;
        }
        // only handle incoming transfer from soonmarket
        if (to == this.contract && from == SOONMARKET) {
            check(asset_ids.length == 1, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED);
            check(ACTION_BURN_MINT_AUCTION == memo || memo.startsWith(ACTION_AUCTION), ERROR_INVALID_ACTION);
            const globals = this.globalsSingleton.get();
            const xprUsdFeed = this.oraclesFeedTable.requireGet(
                globals.oraclesFeedIndexXprUsd,
                ERROR_XPRUSD_FEED_NOT_FOUND,
            );
            check(ORACLES_FEED_NAME_XPRUSD == xprUsdFeed.name, ERROR_XPRUSD_WRONG_FEED_NAME);
            const xprUsdData = this.oraclesDataTable.requireGet(ORACLES_FEED_INDEX_XPRUSD, ERROR_FEED_DATA_NOT_FOUND);
            const xprUsdPrice = xprUsdData.aggregate.f64Value;
            check(xprUsdPrice > 0, ERROR_AGGREGATED_PRICE_MUST_BE_POSITIVE);
            if (ACTION_BURN_MINT_AUCTION == memo) {
                this.burnMintAuction(asset_ids[0], xprUsdPrice);
            } else {
                const memoSplit = memo.split(' ');
                check(memoSplit.length == 2, ERROR_INVALID_MEMO);
                const duration: u32 = <u32>Number.parseInt(memo[1]);
                this.auctionGoldSpot(asset_ids[0], xprUsdPrice, duration);
            }
        }
    }

    burnMintAuction(nftId: u64, xprUsdPrice: f64): void {
        const asset = new TableStore<Assets>(ATOMICASSETS_CONTRACT, this.contract).requireGet(
            nftId,
            'fatal error - should never happen',
        );
        sendBurnAsset(ATOMICASSETS_CONTRACT, this.contract, nftId);
        sendMintAsset(
            ATOMICASSETS_CONTRACT,
            this.contract,
            asset.collection_name,
            asset.schema_name,
            asset.template_id,
            this.contract,
            [],
            [],
            [],
        );
        const startingPriceFloat: i64 = <i64>(
            Math.round((this.globalsSingleton.get().silverAuctStartPriceUsd * 10000) / xprUsdPrice)
        );
        const startingPrice: Asset = new Asset(startingPriceFloat, XPR_SYMBOL);
        const duration: u32 = this.soonmarketGlobals.get().silverPromoDuration;
        this.startAuction(nftId, startingPrice, duration);
    }

    auctionGoldSpot(nftId: u64, xprUsdPrice: f64, duration: u32): void {
        const startingPriceFloat: i64 = <i64>(
            Math.round((this.globalsSingleton.get().goldAuctStartPriceUsd * 10000) / xprUsdPrice)
        );
        const startingPrice: Asset = new Asset(startingPriceFloat, XPR_SYMBOL);
        this.startAuction(nftId, startingPrice, duration);
    }

    startAuction(nftId: u64, startingPrice: Asset, duration: u32): void {
        sendAnnounceAuction(ATOMICMARKET_CONTRACT, this.contract, [nftId], startingPrice, duration, SOONMARKET);
        sendTransferNfts(this.contract, ATOMICMARKET_CONTRACT, [nftId], 'auction');
    }

    // TODO handleAuction (re-auction vs. claim)
    // TODO mint and promote collections directly
    // TODO automated balance forwarding to soonfinance (via notify?)
}
