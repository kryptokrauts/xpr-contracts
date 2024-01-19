import { ActionData, InlineAction, Name, PermissionLevel } from 'proton-tsc';

@packer
export class AuctionDuration extends ActionData {
    constructor(public duration: u32 = 0) {
        super();
    }
}

export function sendAuctionLatestSilverSpot(contractAndActor: Name, duration: u32): void {
    const AUCTION_LATEST_SPOT = new InlineAction<AuctionDuration>('auctlatest');
    const action = AUCTION_LATEST_SPOT.act(contractAndActor, new PermissionLevel(contractAndActor));
    action.send(new AuctionDuration(duration));
}
