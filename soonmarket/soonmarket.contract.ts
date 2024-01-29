import {
    Name,
    Contract,
    TableStore,
    check,
    Singleton,
    unpackActionData,
    currentTimeSec,
    requireAuth,
} from 'proton-tsc';
import { Transfer, sendTransferToken } from 'proton-tsc/token';
import { ATOMICASSETS_CONTRACT, Assets, Collections, TransferNfts, sendTransferNfts } from 'proton-tsc/atomicassets';

import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants';
import { Auctions, Balances } from '../external/atomicmarket/atomicmarket.tables';
import { sendWithdraw } from '../external/atomicmarket/atomicmarket.inline';
import {
    ERROR_AUCTION_NOT_EXISTS,
    ERROR_COLLECTION_NOT_EXISTS,
    ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED,
    ERROR_INVALID_PROMOTION_TYPE,
    ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY,
    ERROR_INVALID_WORD_COUNT,
    ERROR_AUCTION_NOT_STARTED,
    ERROR_ONLY_ONE_SPOT_NFT_ALLOWED,
    ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION,
    ERROR_COLLECTION_BLACKLISTED,
    ERROR_COLLECTION_NOT_VERIFIED,
    ERROR_COLLECTION_ALREADY_BLACKLISTED,
    ERROR_COLLECTION_ALREADY_VERIFIED,
    ERROR_COLLECTION_NOT_BLACKLISTED,
    ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED,
    ERROR_MARKET_BALANCE_NOT_FOUND,
    ONE_HOUR,
    ONE_DAY,
    SPOT_TYPE_GOLD,
    SPOT_TYPE_SILVER,
    PROMO_TYPE_AUCTION,
    PROMO_TYPE_COLLECTION,
    ACTION_AUCTION,
    ACTION_BURN_MINT_AUCTION,
    ERROR_COLLECTION_ALREADY_PROMOTED,
} from './soonmarket.constants';
import { sendLogAuctPromo, sendLogColPromo } from './soonmarket.inline';
import { CollectionsBlacklist, CollectionsVerified, Globals, SilverSpotPromotion } from './soonmarket.tables';
import { Blacklist, Shielding } from '../nftwatchdao/nftwatchdao.tables';

const POWEROFSOON = Name.fromString('powerofsoon');
const NFTWATCHDAO = Name.fromString('nftwatchdao');

@contract
class SoonMarket extends Contract {
    contract: Name = this.receiver;

    // globals singleton table
    globalsSingleton: Singleton<Globals> = new Singleton<Globals>(this.receiver);

    // soonmarket tables
    silverSpotPromotions: TableStore<SilverSpotPromotion> = new TableStore<SilverSpotPromotion>(this.receiver);
    collectionsBlacklist: TableStore<CollectionsBlacklist> = new TableStore<CollectionsBlacklist>(this.receiver);
    collectionsVerified: TableStore<CollectionsVerified> = new TableStore<CollectionsVerified>(this.receiver);

    // nftwatchdao tables
    nftwatchShielded: TableStore<Shielding> = new TableStore<Shielding>(NFTWATCHDAO);
    nftwatchBlacklist: TableStore<Blacklist> = new TableStore<Blacklist>(NFTWATCHDAO);

    // atomicassets tables
    aaAssets: TableStore<Assets> = new TableStore<Assets>(ATOMICASSETS_CONTRACT, this.receiver);
    aaCollections: TableStore<Collections> = new TableStore<Collections>(ATOMICASSETS_CONTRACT);

    // atomicmarket tables
    amAuctions: TableStore<Auctions> = new TableStore<Auctions>(ATOMICMARKET_CONTRACT);
    amBalances: TableStore<Balances> = new TableStore<Balances>(ATOMICMARKET_CONTRACT);

    @action('clmktbalance') // can be called by anybody
    claimMarketBalance(): void {
        const balancesRow = this.amBalances.requireGet(this.contract.N, ERROR_MARKET_BALANCE_NOT_FOUND);
        for (let i = 0; i < balancesRow.quantities.length; i++) {
            // incoming token transfer will trigger payment forward to soonfinance
            sendWithdraw(this.contract, this.contract, balancesRow.quantities[i]);
        }
    }

    @action('setspots')
    setSpots(goldSpotId: u64, silverSpotTemplateId: u32): void {
        requireAuth(this.contract);
        const globals = this.globalsSingleton.get();
        globals.goldSpotId = goldSpotId;
        globals.silverSpotTemplateId = silverSpotTemplateId;
        this.globalsSingleton.set(globals, this.contract);
    }

    @action('setpromodur')
    setPromoDuration(goldPromoDuration: u32, silverPromoDuration: u32): void {
        requireAuth(this.contract);
        const globals = this.globalsSingleton.get();
        globals.goldPromoDuration = goldPromoDuration;
        globals.silverPromoDuration = silverPromoDuration;
        this.globalsSingleton.set(globals, this.contract);
    }

    @action('addblacklist')
    addToBlacklist(collection: Name, comment: string): void {
        requireAuth(this.contract);
        check(this.collectionsBlacklist.get(collection.N) == null, ERROR_COLLECTION_ALREADY_BLACKLISTED);

        const globals = this.globalsSingleton.get();
        globals.blacklistCount++;
        const verifiedRow = this.collectionsVerified.get(collection.N);
        // remove if verified
        if (verifiedRow != null) {
            globals.verifiedCount--;
            this.collectionsVerified.remove(verifiedRow);
        }
        // update globals
        this.globalsSingleton.set(globals, this.contract);

        const blacklistRow = new CollectionsBlacklist(collection, currentTimeSec(), comment);
        this.collectionsBlacklist.store(blacklistRow, this.contract);
    }

    @action('delblacklist')
    delFromBlacklist(collection: Name): void {
        requireAuth(this.contract);
        const blacklistRow = this.collectionsBlacklist.requireGet(collection.N, ERROR_COLLECTION_NOT_BLACKLISTED);

        const globals = this.globalsSingleton.get();
        globals.blacklistCount--;
        this.globalsSingleton.set(globals, this.contract);

        this.collectionsBlacklist.remove(blacklistRow);
    }

    @action('addverified')
    addToVerified(collection: Name, comment: string): void {
        requireAuth(this.contract);
        check(this.collectionsVerified.get(collection.N) == null, ERROR_COLLECTION_ALREADY_VERIFIED);

        const globals = this.globalsSingleton.get();
        globals.verifiedCount++;
        this.globalsSingleton.set(globals, this.contract);

        const verifiedRow = new CollectionsVerified(collection, currentTimeSec(), comment);
        this.collectionsVerified.store(verifiedRow, this.contract);
    }

    @action('delverified')
    delFromVerified(collection: Name): void {
        requireAuth(this.contract);
        const verifiedRow = this.collectionsVerified.requireGet(collection.N, ERROR_COLLECTION_NOT_VERIFIED);

        const globals = this.globalsSingleton.get();
        globals.verifiedCount--;
        this.globalsSingleton.set(globals, this.contract);

        this.collectionsVerified.remove(verifiedRow);
    }

    // handle transfer notification
    @action('transfer', notify)
    onTransfer(): void {
        // notification comes from atomicassets
        if (ATOMICASSETS_CONTRACT == this.firstReceiver) {
            // expecting an NFT transfer
            const actionParams = unpackActionData<TransferNfts>();
            // skip outgoing NFT transfers
            if (actionParams.from == this.contract) {
                return;
            }
            check(actionParams.asset_ids.length == 1, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED);
            const memoWords = actionParams.memo.split(' ');
            check(memoWords.length == 2, ERROR_INVALID_WORD_COUNT);
            check(this.isValidPromotionType(memoWords[0]), ERROR_INVALID_PROMOTION_TYPE);
            this.validateAndHandleSpot(actionParams.asset_ids[0], memoWords[0], memoWords[1], actionParams.from);
        } else {
            // otherwise we expect a regular token transfer
            const actionParams = unpackActionData<Transfer>();
            // skip outgoing transfers & transfers from other accounts than atomicmarket
            if (actionParams.from == this.contract || ATOMICMARKET_CONTRACT != actionParams.from) {
                return;
            }
            sendTransferToken(
                this.firstReceiver,
                this.contract,
                Name.fromString('soonfinance'),
                actionParams.quantity,
                'marketplace revenue',
            );
        }
    }

    @action('logcolpromo')
    logCollectionPromotion(collection: Name, promotedBy: Name, spotType: string, promotionEnd: u32): void {
        requireAuth(this.contract);
    }

    @action('logauctpromo')
    logAuctionPromotion(auctionId: string, promotedBy: Name, spotType: string): void {
        requireAuth(this.contract);
    }

    checkAndGetExistingSilverPromotion(collection: Name): SilverSpotPromotion | null {
        const existingEntry = this.silverSpotPromotions.get(collection.N);
        if (existingEntry != null) {
            check(existingEntry.lastPromoEnd < currentTimeSec(), ERROR_COLLECTION_ALREADY_PROMOTED);
            return existingEntry;
        }
        return null;
    }

    checkValidSilverSpot(spotNftId: u64): void {
        const asset = this.aaAssets.requireGet(spotNftId, 'fatal error - should never happen');
        check(
            this.globalsSingleton.get().silverSpotTemplateId == asset.template_id,
            ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED,
        );
    }

    isValidPromotionType(value: string): boolean {
        const validPromotionTypes = [PROMO_TYPE_AUCTION, PROMO_TYPE_COLLECTION];
        return validPromotionTypes.includes(value);
    }

    checkIfVerified(collection: Name): void {
        const blacklistRow = this.collectionsBlacklist.get(collection.N);
        const nftwatchBlacklistRow = this.nftwatchBlacklist.get(collection.N);
        check(blacklistRow == null && nftwatchBlacklistRow == null, ERROR_COLLECTION_BLACKLISTED);
        const verifiedRow = this.collectionsVerified.get(collection.N);
        const shieldedRow = this.nftwatchShielded.get(collection.N);
        check(verifiedRow != null || shieldedRow != null, ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED);
    }

    validateCollection(collection: Name): void {
        check(this.aaCollections.exists(collection.N), ERROR_COLLECTION_NOT_EXISTS);
        this.checkIfVerified(collection);
    }

    validateAuction(auctionId: string): u32 {
        const auction = this.amAuctions.requireGet(<u64>parseInt(auctionId), ERROR_AUCTION_NOT_EXISTS);
        this.checkIfVerified(auction.collection_name);
        // only allow if assets are transferred / auction started
        check(auction.assets_transferred, ERROR_AUCTION_NOT_STARTED);
        // only allow if the expected end of the auction is 1 hour or more
        check(auction.end_time >= currentTimeSec() + ONE_HOUR, ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION);
        // determine required auction duration for gold spot
        const goldSpotAuctionDuration = auction.end_time - currentTimeSec() + ONE_DAY;
        return goldSpotAuctionDuration;
    }

    validateAndHandleSpot(spotNftId: u64, promoType: string, promoTargetId: string, promotedBy: Name): void {
        const globals = this.globalsSingleton.get();
        let spotType: string = globals.goldSpotId == spotNftId ? SPOT_TYPE_GOLD : SPOT_TYPE_SILVER;
        if (PROMO_TYPE_AUCTION == promoType) {
            check(globals.goldSpotId == spotNftId, ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY);
            const goldSpotAuctionDuration = this.validateAuction(promoTargetId);
            if (globals.goldSpotId != spotNftId) {
                this.checkValidSilverSpot(spotNftId);
            }
            sendLogAuctPromo(this.contract, promoTargetId, promotedBy, spotType);
            const memoAction =
                spotType == SPOT_TYPE_GOLD ? `${ACTION_AUCTION} ${goldSpotAuctionDuration}` : ACTION_BURN_MINT_AUCTION;
            sendTransferNfts(this.contract, POWEROFSOON, [spotNftId], memoAction);
        } else if (PROMO_TYPE_COLLECTION == promoType) {
            const collection = Name.fromString(promoTargetId);
            this.validateCollection(collection);
            const promoDuration = spotType == SPOT_TYPE_GOLD ? globals.goldPromoDuration : globals.silverPromoDuration;
            const promotionEnd = currentTimeSec() + promoDuration;
            if (SPOT_TYPE_GOLD != spotType) {
                this.checkValidSilverSpot(spotNftId);
                let existingEntry = this.checkAndGetExistingSilverPromotion(collection);
                if (existingEntry != null) {
                    existingEntry.lastPromoEnd = promotionEnd;
                    existingEntry.promoCount++;
                    this.silverSpotPromotions.set(existingEntry, this.contract);
                } else {
                    const firstEntry = new SilverSpotPromotion(collection, 1, promotionEnd);
                    this.silverSpotPromotions.store(firstEntry, this.contract);
                }
            }
            sendLogColPromo(this.contract, collection, promotedBy, spotType, promotionEnd);
            // determine required auction duration for gold spot
            const goldSpotAuctionDuration = promotionEnd - currentTimeSec() + ONE_DAY;
            const memoAction =
                spotType == SPOT_TYPE_GOLD ? `${ACTION_AUCTION} ${goldSpotAuctionDuration}` : ACTION_BURN_MINT_AUCTION;
            sendTransferNfts(this.contract, POWEROFSOON, [spotNftId], memoAction);
        }
        if (spotType == SPOT_TYPE_GOLD) {
            globals.goldPromoCount++;
        } else {
            globals.silverPromoCount++;
        }
        this.globalsSingleton.set(globals, this.contract);
    }
}
