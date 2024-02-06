import { ActionData, InlineAction, Name, PermissionLevel } from 'proton-tsc';

/* AuctionDuration as ActionData */
@packer
export class AuctionDuration extends ActionData {
    constructor(public duration: u32 = 0) {
        super();
    }
}

/* Empty ActionData */
@packer
export class EmptyData extends ActionData {
    constructor() {
        super();
    }
}

/**
 * Send the auctlatest action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {u32} duration - duration of the auction in seconds
 */
export function sendAuctionLatestSilverSpot(contractAndActor: Name, duration: u32): void {
    const AUCTION_LATEST_SPOT = new InlineAction<AuctionDuration>('auctlatest');
    const action = AUCTION_LATEST_SPOT.act(contractAndActor, new PermissionLevel(contractAndActor));
    action.send(new AuctionDuration(duration));
}

/**
 * Send the clmktbalance action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 */
export function sendClaimMarketBalance(contractAndActor: Name): void {
    new InlineAction<EmptyData>('clmktbalance')
        .act(contractAndActor, new PermissionLevel(contractAndActor))
        .send(new EmptyData());
}
