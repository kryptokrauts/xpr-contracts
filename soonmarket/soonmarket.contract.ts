// import { Auctions } from "external/atomicmarket/tables.ts"
import { Name, Contract, printStorage, print, TableStore, check } from "proton-tsc"
import { ATOMICASSETS_CONTRACT, Assets, Collections, sendTransferNfts } from 'proton-tsc/atomicassets'

function validateCollection(collectionId: string): void {
    new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(Name.fromString(collectionId).N, 'collection to promote not exists')
    // TODO check if collection is shielded :-)
}

// function validateAuction(auctionId: string) {
//     const auction = new TableStore<Auctions>(Name.fromString('atomicmarket')).requireGet(Number(auctionId), 'auction not found')
//     new TableStore<Collections>(ATOMICASSETS_CONTRACT).requireGet(auction.collection_name.N, 'collection not found')
//     // TODO check if collection is shielded :-)
// }

function validateAndHandleSpot(sender: Name, assetId: u64, memo: string): void {
    if (assetId == <u64>1099511627776) { // gold spot
        sendTransferNfts(sender, Name.fromString('powerofsoon'), [assetId], memo)
    } else {
        const asset = new TableStore<Assets>(ATOMICASSETS_CONTRACT, sender).requireGet(assetId, 'asset not found')
        check(2 == asset.template_id, 'invalid NFT - Silver SPOT expected')
        sendTransferNfts(sender, Name.fromString('powerofsoon'), [assetId], memo)
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
            const promoType: string = memoWords[0]
            check(promoType == 'collection' || promoType == 'auction', 'unknown promotion type')
            if (promoType == 'collection') {
                validateCollection(memoWords[1])
                // TODO log action
                print('log collection promotion')
            } else { // auction
                // TODO log action
                print('log auction promotion')
                // TODO
                // validateAuction(memoWords[1])
            }
            validateAndHandleSpot(this.contract, asset_ids[0], memo)
        }
    }

    @action("printstorage")
    printstorage(): void {
        printStorage()
    }
}