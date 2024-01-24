import { ActionData, InlineAction, Name, PermissionLevel } from 'proton-tsc';

@packer
export class LogCollectionPromotion extends ActionData {
    constructor(
        public collection: Name = new Name(),
        public promotedBy: Name = new Name(),
        public spotType: string = '',
        public promotionEnd: u32 = 0,
    ) {
        super();
    }
}

@packer
export class LogAuctionPromotion extends ActionData {
    constructor(
        public auctionId: string = '',
        public promotedBy: Name = new Name(),
        public spotType: string = '',
    ) {
        super();
    }
}

export function sendLogColPromo(
    contract: Name,
    collection: Name,
    promotedBy: Name,
    spotType: string,
    promotionEnd: u32,
): void {
    const LOG_COL_PROMO = new InlineAction<LogCollectionPromotion>('logcolpromo');
    const action = LOG_COL_PROMO.act(contract, new PermissionLevel(contract));
    const actionParams = new LogCollectionPromotion(collection, promotedBy, spotType, promotionEnd);
    action.send(actionParams);
}

export function sendLogAuctPromo(contract: Name, auctionId: string, promotedBy: Name, spotType: string): void {
    const LOG_AUCT_PROMO = new InlineAction<LogAuctionPromotion>('logauctpromo');
    const action = LOG_AUCT_PROMO.act(contract, new PermissionLevel(contract));
    const actionParams = new LogAuctionPromotion(auctionId, promotedBy, spotType);
    action.send(actionParams);
}
