
import { Name, Contract, TableStore, check, currentReceiver, SafeMath, currentTimePoint, requireAuth, Singleton } from 'proton-tsc'
import { ATOMICASSETS_CONTRACT, Assets, Collections, sendTransferNfts } from 'proton-tsc/atomicassets'

import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants'
import { Auctions } from '../external/atomicmarket/atomicmarket.tables'
import {
    ERROR_AUCTION_NOT_EXISTS,
    ERROR_COLLECTION_NOT_EXISTS,
    ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED,
    ERROR_INVALID_PROMOTION_TYPE,
    ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY,
    ERROR_INVALID_WORD_COUNT, ERROR_AUCTION_NOT_STARTED,
    ERROR_ONLY_ONE_SPOT_NFT_ALLOWED, 
    ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION,
    SILVER_SPOT_AUCTIONS_ENABLED,
    ONE_DAY,
    ONE_HOUR} from './soonmarket.constants'
import { sendLogAuctPromo, sendLogColPromo } from './soonmarket.inline'
import { CollectionsBlacklist, CollectionsVerified, Globals } from './soonmarket.tables'

const POWEROFSOON = Name.fromString('powerofsoon')

@contract
class SoonMarket extends Contract {
    contract: Name = this.receiver

    // globals singleton table
    globalsSingleton: Singleton<Globals> = new Singleton<Globals>(this.receiver)

    // other tables
    collectionsBlacklist: TableStore<CollectionsBlacklist> = new TableStore<CollectionsBlacklist>(this.receiver)
    collectionsVerified: TableStore<CollectionsVerified> = new TableStore<CollectionsVerified>(this.receiver)

    @action('setglobals')
    setGlobals(
        silverPromoCount: u64,
        goldPromoCount: u64,
        silverPromoDuration: u32,
        goldPromoDuration: u32,
        goldSpotAssetId: u64,
        silverSpotTemplateId: u32
    ): void {
        requireAuth(this.contract)
        const currentGlobals = this.globalsSingleton.get()
        const updatedGlobals = new Globals(
            currentGlobals.blacklistCount,
            currentGlobals.verifiedCount,
            silverPromoCount,
            goldPromoCount,
            silverPromoDuration,
            goldPromoDuration,
            goldSpotAssetId,
            silverSpotTemplateId)
        this.globalsSingleton.set(updatedGlobals, this.contract)
    }

    @action('transfer', notify)
    onReceive(from: Name, to: Name, asset_ids: u64[], memo: string): void {
        // Skip outgoing NFT transfers
        if (from == this.contract) {
            return;
        }
        // Handling incoming NFT transfer
        if (to == this.contract) {
            check(asset_ids.length == 1, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED)
            const memoWords = memo.split(' ')
            check(memoWords.length == 2, ERROR_INVALID_WORD_COUNT)
            check(this.isValidPromotionType(memoWords[0]), ERROR_INVALID_PROMOTION_TYPE)
            this.validateAndHandleSpot(asset_ids[0], memoWords[0], memoWords[1], from)
        }
    }

    @action('logcolpromo')
    logCollectionPromotion(collection: Name, promotedBy: Name, spotType: string, promotionEnd: u32): void {
        requireAuth(currentReceiver())
    }

    @action('logauctpromo')
    logAuctionPromotion(auctionId: string, promotedBy: Name, spotType: string, promotionEnd: u32): void {
        requireAuth(currentReceiver())
    }

    isValidPromotionType(value: string): boolean {
        const validPromotionTypes = ['auction', 'collection']
        return validPromotionTypes.includes(value)
    }
    
    validateAuction(auctionId: string): u32 {
        const auction = new TableStore<Auctions>(ATOMICMARKET_CONTRACT).requireGet(<u64>parseInt(auctionId), ERROR_AUCTION_NOT_EXISTS)
        const collection = new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(auction.collection_name.N, ERROR_COLLECTION_NOT_EXISTS)
        // TODO check if collection is shielded / verified
        // only allow if assets are transferred / auction started
        check(auction.assets_transferred, ERROR_AUCTION_NOT_STARTED)
        // only allow if the expected end of the auction is 1 hour or more
        check(auction.end_time > SafeMath.add(currentTimePoint().secSinceEpoch(), ONE_HOUR), ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION)
        // determine required auction duration for gold spot
        const goldSpotAuctionDuration = <u32>SafeMath.add(SafeMath.sub(auction.end_time, currentTimePoint().secSinceEpoch()), ONE_DAY)
        return goldSpotAuctionDuration
    }
    
    validateCollection(collection: Name): void {
        new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(collection.N, ERROR_COLLECTION_NOT_EXISTS)
        // TODO check if collection is shielded / verified
    }
    
    validateAndHandleSpot(spotNftId: u64, promoType: string, promoTargetId: string, promotedBy: Name): void {
        let spotType: string
        if ('auction' == promoType) {
            // TODO remove silver spot check in new market
            check(1099511627776 == spotNftId || SILVER_SPOT_AUCTIONS_ENABLED, ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY)
            const goldSpotAuctionDuration = this.validateAuction(promoTargetId)
            if (1099511627776 == spotNftId) {
                spotType = 'gold'
            } else {
                const asset = new TableStore<Assets>(ATOMICASSETS_CONTRACT, currentReceiver()).requireGet(spotNftId, 'fatal error - should never happen')
                check(2 == asset.template_id, ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED)
                spotType = 'silver'
            }
            sendLogAuctPromo(this.contract, promoTargetId, promotedBy, spotType)
            const memoAction = spotType == 'gold' ? `auction ${goldSpotAuctionDuration}` : 'burn'
            sendTransferNfts(currentReceiver(), POWEROFSOON, [spotNftId], memoAction)
        } else if ('collection' == promoType) {
            const collection = Name.fromString(promoTargetId)
            this.validateCollection(collection)
            if (1099511627776 == spotNftId) {
                spotType = 'gold'
            } else {
                const asset = new TableStore<Assets>(ATOMICASSETS_CONTRACT, currentReceiver()).requireGet(spotNftId, 'fatal error - should never happen')
                check(2 == asset.template_id, ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED)
                spotType = 'silver'
            }
            // TODO read from table
            const TWO_WEEKS = 1_209_600
            const ONE_WEEK = 604_800
            const promotionEnd = <u32>SafeMath.add(currentTimePoint().secSinceEpoch(), spotType == 'gold' ? TWO_WEEKS : ONE_WEEK)
            sendLogColPromo(this.contract, collection, promotedBy, spotType, promotionEnd)
            const goldSpotAuctionDuration = SafeMath.add(promotionEnd, ONE_DAY)
            const memoAction = spotType == 'gold' ? `auction ${goldSpotAuctionDuration}` : 'burn'
            sendTransferNfts(currentReceiver(), POWEROFSOON, [spotNftId], memoAction)
        }
    }
}