import { ActionData, InlineAction, Name, PermissionLevel } from 'proton-tsc';

/* LogCollectionPromotion ActionData */
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

/* LogAuctionPromotion ActionData */
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

/**
 * Send the logcolpromo action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the promoted collection
 * @param {Name} promotedBy - account that promoted the collection
 * @param {string} spotType - silver|gold
 * @param {string} promotionEnd - timestamp (seconds since epoch) where the promotion ends
 */
export function sendLogColPromo(
    contractAndActor: Name,
    collection: Name,
    promotedBy: Name,
    spotType: string,
    promotionEnd: u32,
): void {
    const LOG_COL_PROMO = new InlineAction<LogCollectionPromotion>('logcolpromo');
    const action = LOG_COL_PROMO.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogCollectionPromotion(collection, promotedBy, spotType, promotionEnd);
    action.send(actionParams);
}

/**
 * Send the logauctpromo action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {string} auctionId - id of the promoted auction
 * @param {Name} promotedBy - account that promoted the collection
 * @param {string} spotType - silver|gold
 */
export function sendLogAuctPromo(contractAndActor: Name, auctionId: string, promotedBy: Name, spotType: string): void {
    const LOG_AUCT_PROMO = new InlineAction<LogAuctionPromotion>('logauctpromo');
    const action = LOG_AUCT_PROMO.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogAuctionPromotion(auctionId, promotedBy, spotType);
    action.send(actionParams);
}
