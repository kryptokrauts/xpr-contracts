import { Asset, Contract, Name, Singleton, TableStore, check, requireAuth, unpackActionData } from 'proton-tsc';
import { XPR_SYMBOL } from 'proton-tsc/system';
import { Data, Feed, ORACLES_CONTRACT } from 'proton-tsc/oracles';
import {
    ATOMICASSETS_CONTRACT,
    Assets,
    TransferNfts,
    sendBurnAsset,
    sendMintAsset,
    sendTransferNfts,
} from 'proton-tsc/atomicassets';
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
    ERROR_SILVER_SPOT_EXPECTED,
} from './powerofsoon.constants';
import { Balances } from '../external/atomicmarket/atomicmarket.tables';
import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants';
import {
    sendAnnounceAuction,
    sendAuctionClaimSeller,
    sendCancelAuction,
    sendWithdraw,
} from '../external/atomicmarket/atomicmarket.inline';
import { Globals } from './powerofsoon.tables';
import { Globals as SoonMarketGlobals } from '../soonmarket/soonmarket.tables';
import { sendAuctionLatestSilverSpot } from './powerofsoon.inline';
import { Transfer, sendTransferToken } from 'proton-tsc/token';

const SOONMARKET = Name.fromString('soonmarket');

@contract
class PowerOfSoon extends Contract {
    contract: Name = this.receiver;

    // globals singleton table
    globalsSingleton: Singleton<Globals> = new Singleton<Globals>(this.receiver);

    // soonmarket globals
    smGlobals: Singleton<SoonMarketGlobals> = new Singleton<SoonMarketGlobals>(SOONMARKET);

    // atomicassets assets
    aaAssets: TableStore<Assets> = new TableStore<Assets>(ATOMICASSETS_CONTRACT, this.receiver);
    // atomicmarket balances table
    amBalances: TableStore<Balances> = new TableStore<Balances>(ATOMICMARKET_CONTRACT);
    // oracles tables
    oraclesFeedTable: TableStore<Feed> = new TableStore<Feed>(ORACLES_CONTRACT);
    oraclesDataTable: TableStore<Data> = new TableStore<Data>(ORACLES_CONTRACT);

    @action('setstartpric')
    setStartPrices(goldAuctStartingPriceUsd: u32, silverAuctStartingPriceUsd: u32): void {
        requireAuth(this.contract);
        check(goldAuctStartingPriceUsd > 0 && silverAuctStartingPriceUsd > 0, ERROR_NEGATIVE_START_PRICE);
        const globals = this.globalsSingleton.get();
        globals.goldAuctStartPriceUsd = goldAuctStartingPriceUsd;
        globals.silverAuctStartPriceUsd = silverAuctStartingPriceUsd;
        this.globalsSingleton.set(globals, this.contract);
    }

    @action('clmktbalance') // can be called by anybody
    claimMarketBalance(): void {
        const balancesRow = this.amBalances.requireGet(this.contract.N, ERROR_MARKET_BALANCE_NOT_FOUND);
        for (let i = 0; i < balancesRow.quantities.length; i++) {
            // incoming token transfer will trigger payment forward to soonfinance
            sendWithdraw(this.contract, this.contract, balancesRow.quantities[i]);
        }
    }

    @action('claimauctinc') // can be called by anybody
    claimAuctionIncome(auctionId: u64): void {
        // incoming token transfer will trigger payment forward to soonfinance
        sendAuctionClaimSeller(this.contract, auctionId);
    }

    @action('cancelauct') // can be called by anybody
    cancelAuction(auction_id: u64): void {
        // incoming NFT transfer will automatically trigger a new auction in case of a silver spot
        sendCancelAuction(this.contract, auction_id);
    }

    @action('mintfreespot')
    mintSilverSpot(recipient: Name, memo: string): void {
        requireAuth(this.contract);
        // TODO test if this can be called without a memo (memo should be visible on explorer)
        const soonmarketGlobals = this.smGlobals.get();
        sendMintAsset(
            this.contract,
            this.contract,
            soonmarketGlobals.spotCollection,
            soonmarketGlobals.spotCollection,
            soonmarketGlobals.silverSpotTemplateId,
            recipient,
            [],
            [],
            [],
        );
    }

    @action('mintauctspot')
    mintAndAuctionSpot(duration: u32): void {
        requireAuth(this.contract);
        const soonmarketGlobals = this.smGlobals.get();
        sendMintAsset(
            this.contract,
            this.contract,
            soonmarketGlobals.spotCollection,
            soonmarketGlobals.spotCollection,
            soonmarketGlobals.silverSpotTemplateId,
            this.contract,
            [],
            [],
            [],
        );
        // separate InlineAction required
        // see https://docs.xprnetwork.org/contract-sdk/execution-order.html
        sendAuctionLatestSilverSpot(this.contract, duration);
    }

    @action('auctlatest')
    auctionLatestSilverSpot(duration: u32): void {
        requireAuth(this.contract);
        const latestAsset = this.aaAssets.last();
        check(
            latestAsset != null && latestAsset.template_id == this.smGlobals.get().silverSpotTemplateId,
            ERROR_SILVER_SPOT_EXPECTED,
        );
        const xprUsdPrice = this.getAndCheckXprUsdPrice();
        const startingPrice = this.getSilverSpotStartingPrice(xprUsdPrice);
        this.startAuction(latestAsset!.asset_id, startingPrice, duration);
    }

    // handle transfer notification
    @action('transfer', notify)
    onTransfer(): void {
        // notification comes from atomicassets
        if (ATOMICASSETS_CONTRACT == this.firstReceiver) {
            // expecting an NFT transfer
            const actionParams = unpackActionData<TransferNfts>();
            // skip outgoing NFT transfers & all NFT transfers where soonmarket is not sender
            if (actionParams.from == this.contract || actionParams.from != SOONMARKET) {
                return;
            }
            // only handle notifications from atomicassets contract where this contract is recipient & soonmarket is sender
            if (actionParams.to == this.contract) {
                check(actionParams.asset_ids.length == 1, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED);
                check(
                    ACTION_BURN_MINT_AUCTION == actionParams.memo || actionParams.memo.startsWith(ACTION_AUCTION),
                    ERROR_INVALID_ACTION,
                );
                const globals = this.globalsSingleton.get();
                const xprUsdFeed = this.oraclesFeedTable.requireGet(
                    globals.oraclesFeedIndexXprUsd,
                    ERROR_XPRUSD_FEED_NOT_FOUND,
                );
                check(ORACLES_FEED_NAME_XPRUSD == xprUsdFeed.name, ERROR_XPRUSD_WRONG_FEED_NAME);
                const xprUsdPrice = this.getAndCheckXprUsdPrice();
                if (ACTION_BURN_MINT_AUCTION == actionParams.memo) {
                    this.burnMintAuction(actionParams.asset_ids[0], xprUsdPrice);
                } else {
                    const memoSplit = actionParams.memo.split(' ');
                    check(memoSplit.length == 2, ERROR_INVALID_MEMO);
                    const duration: u32 = <u32>Number.parseInt(actionParams.memo[1]);
                    this.auctionGoldSpot(actionParams.asset_ids[0], xprUsdPrice, duration);
                }
            }
        } else {
            // otherwise we expect a regular token transfer
            const actionParams = unpackActionData<Transfer>();
            // skip outgoing transfers & transfers from other accounts than atomicmarket
            if (actionParams.from == this.contract || ATOMICMARKET_CONTRACT != actionParams.from) {
                return;
            }
            // forward tokens to soonfinance
            // we do not check firstReceiver for now. at this point it is safe to assume that tokens supported by atomicmarket can be trusted
            sendTransferToken(
                this.firstReceiver,
                this.contract,
                Name.fromString('soonfinance'),
                actionParams.quantity,
                'nft sale proceeds & royalties',
            );
        }
    }

    getAndCheckXprUsdPrice(): f64 {
        const xprUsdData = this.oraclesDataTable.requireGet(ORACLES_FEED_INDEX_XPRUSD, ERROR_FEED_DATA_NOT_FOUND);
        const xprUsdPrice = xprUsdData.aggregate.f64Value;
        check(xprUsdPrice > 0, ERROR_AGGREGATED_PRICE_MUST_BE_POSITIVE);
        return xprUsdPrice;
    }

    getSilverSpotStartingPrice(xprUsdPrice: f64): Asset {
        const startingPriceFloat: i64 = <i64>(
            Math.round((this.globalsSingleton.get().silverAuctStartPriceUsd * 10000) / xprUsdPrice)
        );
        return new Asset(startingPriceFloat, XPR_SYMBOL);
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
        const startingPrice: Asset = this.getSilverSpotStartingPrice(xprUsdPrice);
        const duration: u32 = this.smGlobals.get().silverPromoDuration;
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
        sendAnnounceAuction(this.contract, [nftId], startingPrice, duration, SOONMARKET);
        sendTransferNfts(this.contract, ATOMICMARKET_CONTRACT, [nftId], 'auction');
    }
}
