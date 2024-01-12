
import { Name, Contract, printStorage, print, TableStore, check } from "proton-tsc"
import { ATOMICASSETS_CONTRACT, Assets, Collections, sendTransferNfts } from 'proton-tsc/atomicassets'

import { ATOMICMARKET_CONTRACT } from "../external/atomicmarket/atomicmarket.constants"
import { Auctions } from "../external/atomicmarket/atomicmarket.tables"

function isValidPromotionType(value: string): boolean {
    const validPromotionTypes = ['auction', 'collection']
    return validPromotionTypes.includes(value)
}

function validateAuction(auctionId: string): number {
    const auctionIdTyped = u64(Number.parseInt(auctionId))
    const auction = new TableStore<Auctions>(ATOMICMARKET_CONTRACT).requireGet(auctionIdTyped, 'auction not found')
    const collection = new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(auction.collection_name.N, 'collection not found')
    // TODO check if collection is shielded :-)
    check(auction.assets_transferred, 'not allowed - auction not started yet')
    return auction.end_time
}

function validateCollection(collectionId: string): void {
    new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(Name.fromString(collectionId).N, 'collection not exists')
    // TODO check if collection is shielded :-)
}

function validateAndHandleSpot(soonmarket: Name, spotNftId: u64, promoType: string, promoTargetId: string, promotedBy: Name, ): void {
    const powerofsoon = Name.fromString('powerofsoon')
    if ('auction' == promoType) {
        check(1099511627776 == spotNftId, 'invalid promotion type - auction only allowed for Gold SPOT')
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
            check(2 == asset.template_id, 'invalid NFT - Silver SPOT expected')
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
            check(asset_ids.length == 1, 'only one spot can be redeemed for promotion')
            const memoWords = memo.split(' ')
            check(memoWords.length == 2, 'invalid word count in memo')
            check(isValidPromotionType(memoWords[0]), 'invalid promotion type')
            validateAndHandleSpot(this.contract, asset_ids[0], memoWords[0], memoWords[1], from)
        }
    }

    @action("printstorage")
    printstorage(): void {
        printStorage()
    }
}