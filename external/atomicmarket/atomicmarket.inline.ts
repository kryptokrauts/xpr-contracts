import { ActionData, Asset, InlineAction, Name, PermissionLevel } from 'proton-tsc';

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

export function sendWithdraw(contract: Name, owner: Name, token: Asset): void {
    const WITHDRAW = new InlineAction<Withdraw>('withdraw');
    const action = WITHDRAW.act(contract, new PermissionLevel(contract));
    const actionParams = new Withdraw(owner, token);
    action.send(actionParams);
}

export function sendAnnounceAuction(
    contract: Name,
    seller: Name,
    asset_ids: Array<u64>,
    starting_bid: Asset,
    duration: u32,
    maker_marketplace: Name,
): void {
    const ANNOUNCE_AUCTION = new InlineAction<AnnounceAuction>('announceauct');
    const action = ANNOUNCE_AUCTION.act(contract, new PermissionLevel(contract));
    const actionParams = new AnnounceAuction(seller, asset_ids, starting_bid, duration, maker_marketplace);
    action.send(actionParams);
}
