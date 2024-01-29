import { Table, Name } from 'proton-tsc';
import {
    GOLD_SPOT_ID_MAINNET,
    ONE_WEEK,
    SILVER_SPOT_TEMPLATE_ID_MAINNET,
    SPOT_COLLECTION_NAME,
    TWO_WEEKS,
} from './soonmarket.constants';

@table('globals', singleton)
export class Globals extends Table {
    constructor(
        public blacklistCount: u64 = 0,
        public verifiedCount: u64 = 0,
        public silverPromoCount: u64 = 0,
        public goldPromoCount: u64 = 0,
        public silverPromoDuration: u32 = ONE_WEEK,
        public goldPromoDuration: u32 = TWO_WEEKS,
        public spotCollection: Name = Name.fromString(SPOT_COLLECTION_NAME),
        public goldSpotId: u64 = GOLD_SPOT_ID_MAINNET,
        public silverSpotTemplateId: u32 = SILVER_SPOT_TEMPLATE_ID_MAINNET,
    ) {
        super();
    }
}

@table('silverpromos')
export class SilverSpotPromotions extends Table {
    constructor(
        public collection: Name = new Name(),
        public promoCount: u64 = 0,
        public lastPromoEnd: u32 = 0,
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}

@table('colblacklist')
export class CollectionsBlacklist extends Table {
    constructor(
        public collection: Name = new Name(),
        public timestamp: u32 = 0,
        public comment: string = ''
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}

@table('colverified')
export class CollectionsVerified extends Table {
    constructor(
        public collection: Name = new Name(),
        public timestamp: u32 = 0,
        public comment: string = ''
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}
