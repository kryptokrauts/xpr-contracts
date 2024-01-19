import { ActionData, Asset, InlineAction, Name, PermissionLevel } from 'proton-tsc';
import { ATOMICMARKET_CONTRACT } from './atomicmarket.constants';

@packer
export class Withdraw extends ActionData {
    constructor(
        public owner: Name = new Name(),
        public token_to_withdraw: Asset = new Asset(),
    ) {
        super();
    }
}

@packer
export class AnnounceAuction extends ActionData {
    constructor(
        public seller: Name = new Name(),
        public asset_ids: Array<u64> = [],
        public starting_bid: Asset = new Asset(),
        public duration: u32 = 0,
        public maker_marketplace: Name = new Name(),
    ) {
        super();
    }
}

@packer
class AuctionId extends ActionData {
    constructor(public auction_id: u64 = 0) {
        super();
    }
}

export function sendWithdraw(actor: Name, owner: Name, token: Asset): void {
    const WITHDRAW = new InlineAction<Withdraw>('withdraw');
    const action = WITHDRAW.act(ATOMICMARKET_CONTRACT, new PermissionLevel(actor));
    const actionParams = new Withdraw(owner, token);
    action.send(actionParams);
}

export function sendAnnounceAuction(
    seller: Name,
    asset_ids: Array<u64>,
    starting_bid: Asset,
    duration: u32,
    maker_marketplace: Name,
): void {
    const ANNOUNCE_AUCTION = new InlineAction<AnnounceAuction>('announceauct');
    const action = ANNOUNCE_AUCTION.act(ATOMICMARKET_CONTRACT, new PermissionLevel(seller));
    const actionParams = new AnnounceAuction(seller, asset_ids, starting_bid, duration, maker_marketplace);
    action.send(actionParams);
}

export function sendAuctionClaimSeller(actor: Name, auctionId: u64): void {
    const AUCTION_CLAIM_SELLER = new InlineAction<AuctionId>('auctclaimsel');
    const action = AUCTION_CLAIM_SELLER.act(ATOMICMARKET_CONTRACT, new PermissionLevel(actor));
    const actionParams = new AuctionId(auctionId);
    action.send(actionParams);
}

export function sendCancelAuction(actor: Name, auctionId: u64): void {
    const CANCEL_AUCTION = new InlineAction<AuctionId>('cancelauct');
    const action = CANCEL_AUCTION.act(ATOMICMARKET_CONTRACT, new PermissionLevel(actor));
    const actionParams = new AuctionId(auctionId);
    action.send(actionParams);
}
