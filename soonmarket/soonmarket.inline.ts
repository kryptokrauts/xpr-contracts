import { ActionData, Name } from 'proton-tsc';

// Create packer class for object to send
@packer
export class LogCollectionPromotion extends ActionData {
    constructor (
        public collectionId: string = '',
        public promotedBy: Name = new Name(),
        public spotType: string = '',
        public promotionEnd: u32 = 0
    ) {
        super();
    }
}

// Create packer class for object to send
@packer
export class LogAuctionPromotion extends ActionData {
    constructor (
        public auctionId: string = '',
        public promotedBy: Name = new Name(),
        public spotType: string = '',
        public promotionEnd: u32 = 0
    ) {
        super();
    }
}