import { Name, Contract, TableStore, check, SafeMath, currentTimePoint, Singleton } from 'proton-tsc';
import { ATOMICASSETS_CONTRACT, Assets, Collections, sendTransferNfts } from 'proton-tsc/atomicassets';

import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants';
import { Auctions } from '../external/atomicmarket/atomicmarket.tables';
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
    ONE_HOUR,
    ONE_DAY,
    SILVER_SPOT_AUCTIONS_ENABLED,
    SPOT_TYPE_GOLD,
    SPOT_TYPE_SILVER,
    PROMO_TYPE_AUCTION,
    PROMO_TYPE_COLLECTION,
    ACTION_AUCTION,
    ACTION_BURN_MINT_AUCTION,
} from './soonmarket.constants';
import { requireAuth } from 'as-chain';
import { sendLogAuctPromo, sendLogColPromo } from './soonmarket.inline';
import { CollectionsBlacklist, CollectionsVerified, Globals } from './soonmarket.tables';

const POWEROFSOON = Name.fromString('powerofsoon');

@contract
class SoonMarket extends Contract {
    contract: Name = this.receiver;

    // globals singleton table
    globalsSingleton: Singleton<Globals> = new Singleton<Globals>(this.receiver);

    // soonmarket tables
    collectionsBlacklist: TableStore<CollectionsBlacklist> = new TableStore<CollectionsBlacklist>(this.receiver);
    collectionsVerified: TableStore<CollectionsVerified> = new TableStore<CollectionsVerified>(this.receiver);

    // atomicassets tables
    aaAssets: TableStore<Assets> = new TableStore<Assets>(ATOMICASSETS_CONTRACT, this.receiver);
    aaCollections: TableStore<Collections> = new TableStore<Collections>(ATOMICASSETS_CONTRACT);

    // atomicmarket tables
    amAuctions: TableStore<Auctions> = new TableStore<Auctions>(ATOMICMARKET_CONTRACT);

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
    addToBlacklist(collection: Name, comment: string, references: Array<string>): void {
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

        const blacklistRow = new CollectionsBlacklist(
            collection,
            currentTimePoint().secSinceEpoch(),
            comment,
            references,
        );
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
    addToVerified(collection: Name, comment: string, references: Array<string>): void {
        requireAuth(this.contract);
        check(this.collectionsVerified.get(collection.N) == null, ERROR_COLLECTION_ALREADY_VERIFIED);

        const globals = this.globalsSingleton.get();
        globals.verifiedCount++;
        this.globalsSingleton.set(globals, this.contract);

        const verifiedRow = new CollectionsVerified(
            collection,
            currentTimePoint().secSinceEpoch(),
            comment,
            references,
        );
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

    @action('transfer', notify)
    onReceive(from: Name, to: Name, asset_ids: u64[], memo: string): void {
        // skip outgoing NFT transfers
        if (from == this.contract) {
            return;
        }
        // handling incoming NFT transfer
        if (to == this.contract) {
            check(asset_ids.length == 1, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED);
            const memoWords = memo.split(' ');
            check(memoWords.length == 2, ERROR_INVALID_WORD_COUNT);
            check(this.isValidPromotionType(memoWords[0]), ERROR_INVALID_PROMOTION_TYPE);
            this.validateAndHandleSpot(asset_ids[0], memoWords[0], memoWords[1], from);
        }
    }

    // TODO automated balance forwarding to soonfinance (via notify?)

    @action('logcolpromo')
    logCollectionPromotion(collection: Name, promotedBy: Name, spotType: string, promotionEnd: u32): void {
        requireAuth(this.contract);
    }

    @action('logauctpromo')
    logAuctionPromotion(auctionId: string, promotedBy: Name, spotType: string): void {
        requireAuth(this.contract);
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
        check(blacklistRow == null, ERROR_COLLECTION_BLACKLISTED);
        const verifiedRow = this.collectionsVerified.get(collection.N);
        // TODO real NFT Watch check
        const shielded = false;
        check(verifiedRow != null || shielded, ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED);
    }

    validateCollection(collection: Name): void {
        this.aaCollections.requireGet(collection.N, ERROR_COLLECTION_NOT_EXISTS);
        this.checkIfVerified(collection);
    }

    validateAuction(auctionId: string): u32 {
        const auction = this.amAuctions.requireGet(<u64>parseInt(auctionId), ERROR_AUCTION_NOT_EXISTS);
        const collection = this.aaCollections.requireGet(auction.collection_name.N, ERROR_COLLECTION_NOT_EXISTS);
        this.checkIfVerified(collection.collection_name);
        // only allow if assets are transferred / auction started
        check(auction.assets_transferred, ERROR_AUCTION_NOT_STARTED);
        // only allow if the expected end of the auction is 1 hour or more
        check(
            auction.end_time > SafeMath.add(currentTimePoint().secSinceEpoch(), ONE_HOUR),
            ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION,
        );
        // determine required auction duration for gold spot
        const goldSpotAuctionDuration = <u32>(
            SafeMath.add(SafeMath.sub(auction.end_time, currentTimePoint().secSinceEpoch()), ONE_DAY)
        );
        return goldSpotAuctionDuration;
    }

    validateAndHandleSpot(spotNftId: u64, promoType: string, promoTargetId: string, promotedBy: Name): void {
        const globals = this.globalsSingleton.get();
        let spotType: string = globals.goldSpotId == spotNftId ? SPOT_TYPE_GOLD : SPOT_TYPE_SILVER;
        if (PROMO_TYPE_AUCTION == promoType) {
            // TODO remove silver spot check in new market
            check(
                globals.goldSpotId == spotNftId || SILVER_SPOT_AUCTIONS_ENABLED,
                ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY,
            );
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
            let promoDuration = SPOT_TYPE_GOLD ? globals.goldPromoDuration : globals.silverPromoDuration;
            if (SPOT_TYPE_GOLD != spotType) {
                this.checkValidSilverSpot(spotNftId);
            }
            const promotionEnd = <u32>SafeMath.add(currentTimePoint().secSinceEpoch(), promoDuration);
            sendLogColPromo(this.contract, collection, promotedBy, spotType, promotionEnd);
            // determine required auction duration for gold spot
            const goldSpotAuctionDuration = <u32>(
                SafeMath.add(SafeMath.sub(promotionEnd, currentTimePoint().secSinceEpoch()), ONE_DAY)
            );
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
