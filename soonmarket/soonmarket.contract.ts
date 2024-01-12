
import { Name, Contract, printStorage, print, TableStore, check } from "proton-tsc"
import { ATOMICASSETS_CONTRACT, Assets, Collections, sendTransferNfts } from 'proton-tsc/atomicassets'

import { ATOMICMARKET_CONTRACT } from "../external/atomicmarket/atomicmarket.constants"
import { Auctions } from "../external/atomicmarket/atomicmarket.tables"
import { ERROR_AUCTION_NOT_EXISTS, ERROR_COLLECTION_NOT_EXISTS, ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED, ERROR_INVALID_PROMOTION_TYPE, ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY, ERROR_INVALID_WORD_COUNT, ERROR_NOT_ALLOWED_AUCTION_NOT_STARTED, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED } from "./soonmarket.constants"

function isValidPromotionType(value: string): boolean {
    const validPromotionTypes = ['auction', 'collection']
    return validPromotionTypes.includes(value)
}

function validateAuction(auctionId: string): number {
    const auctionIdTyped = u64(Number.parseInt(auctionId))
    const auction = new TableStore<Auctions>(ATOMICMARKET_CONTRACT).requireGet(auctionIdTyped, ERROR_AUCTION_NOT_EXISTS)
    const collection = new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(auction.collection_name.N, ERROR_COLLECTION_NOT_EXISTS)
    // TODO check if collection is shielded :-)
    check(auction.assets_transferred, ERROR_NOT_ALLOWED_AUCTION_NOT_STARTED)
    return auction.end_time
}

function validateCollection(collectionId: string): void {
    new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(Name.fromString(collectionId).N, ERROR_COLLECTION_NOT_EXISTS)
    // TODO check if collection is shielded :-)
}

function validateAndHandleSpot(soonmarket: Name, spotNftId: u64, promoType: string, promoTargetId: string, promotedBy: Name, ): void {
    const powerofsoon = Name.fromString('powerofsoon')
    if ('auction' == promoType) {
        check(1099511627776 == spotNftId, ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY)
        const expectedEnd = validateAuction(promoTargetId)
        // TODO logauctpromo (auctionId, promoter, expectedEnd)
        sendTransferNfts(soonmarket, powerofsoon, [spotNftId], 'TODO')
    } else if ('collection' == promoType) {
        validateCollection(promoTargetId)
        let spotType: string
        if (1099511627776 == spotNftId) {
            spotType = 'gold'
        } else {
            const asset = new TableStore<Assets>(ATOMICASSETS_CONTRACT, soonmarket).requireGet(spotNftId, 'fatal error - should never happen')
            check(2 == asset.template_id, ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED)
            spotType = 'silver'
        }
        // TODO logcolpromo (collectionId, promoter, duration)
        sendTransferNfts(soonmarket, powerofsoon, [spotNftId], 'TODO')
    }
}

@contract
class SoonMarket extends Contract {
    contract: Name = this.receiver

    @action("transfer", notify)
    onReceive(from: Name, to: Name, asset_ids: u64[], memo: string): void {
        // Skip outgoing NFT transfers
        if (from == this.contract) {
            return;
        }
        // Handling incoming NFT transfer
        if (to == this.contract) {
            print(memo)
            check(asset_ids.length == 1, ERROR_ONLY_ONE_SPOT_NFT_ALLOWED)
            const memoWords = memo.split(' ')
            check(memoWords.length == 2, ERROR_INVALID_WORD_COUNT)
            check(isValidPromotionType(memoWords[0]), ERROR_INVALID_PROMOTION_TYPE)
            validateAndHandleSpot(this.contract, asset_ids[0], memoWords[0], memoWords[1], from)
        }
    }

    @action("printstorage")
    printstorage(): void {
        printStorage()
    }
}