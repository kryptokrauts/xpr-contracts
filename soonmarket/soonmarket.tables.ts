import { Table, Name } from 'proton-tsc';
import { ONE_WEEK, TWO_WEEKS } from './soonmarket.constants';

@table('globals', singleton)
export class Globals extends Table {
    constructor(
        public blacklistCount: u64 = 0,
        public verifiedCount: u64 = 0,
        public silverPromoCount: u64 = 0,
        public goldPromoCount: u64 = 0,
        public silverPromoDuration: u32 = ONE_WEEK,
        public goldPromoDuration: u32 = TWO_WEEKS,
        public goldSpotId: u64 = 4398046764318, // mainnet value
        public silverSpotTemplateId: u32 = 51066, // mainnet value
    ) {
        super();
    }
}

@table('colblacklist')
export class CollectionsBlacklist extends Table {
    constructor(
        public collection: Name = new Name(),
        public timestamp: u32 = 0,
        public comment: string = '',
        public references: Array<string> = [],
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
        public comment: string = '',
        public references: Array<string> = [],
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}
