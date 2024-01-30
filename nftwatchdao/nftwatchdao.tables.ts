import { Asset, EMPTY_NAME, Name, Table } from 'proton-tsc';
import { SHIELDING_PRICE_XPR } from './nftwatchdao.constants';
import { XPR_SYMBOL } from 'proton-tsc/system';

@table('globals', singleton)
export class Globals extends Table {
    constructor(
        public shieldingPrice: Asset = Asset.fromString(SHIELDING_PRICE_XPR),
        public shieldingGuardFee: u8 = 50,
        public shieldingDaoFee: u8 = 40,
        public shieldingMarketFee: u8 = 10,
        public blacklistCount: u64 = 0,
        public shieldCount: u64 = 0,
        public authorizedGuards: Array<Name> = [],
        public marketplaces: Array<Name> = [Name.fromString('soonmarket')],
    ) {
        super();
    }
}

@table('balances')
export class Balance extends Table {
    constructor(
        public account: Name = EMPTY_NAME,
        public xpr: Asset = new Asset(0, XPR_SYMBOL),
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.account.N;
    }
}

@table('blacklist')
export class Blacklist extends Table {
    constructor(
        public collection: Name = new Name(),
        public reportReason: string = '',
        public reportedBy: Name = new Name(),
        public confirmedBy: Name = new Name(),
        public guardComment: string = '',
        public timestamp: u32 = 0, // seconds since epoch
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}

@table('shieldings')
export class Shielding extends Table {
    constructor(
        public collection: Name = new Name(),
        public requestedBy: Name = new Name(),
        public confirmedBy: Name = new Name(),
        public reportCid: string = '',
        public timestamp: u32 = 0, // seconds since epoch
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}

@table('blacklistrep')
export class BlacklistReport extends Table {
    constructor(
        public collection: Name = new Name(),
        public reportedBy: Name = new Name(),
        public reportReason: string = '',
        public reportTime: u32 = 0, // seconds since epoch
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}

@table('shieldingreq')
export class ShieldingRequest extends Table {
    constructor(
        public collection: Name = new Name(),
        public requestedBy: Name = new Name(),
        public requestPrice: Asset = new Asset(),
        public requestMarketplace: Name = new Name(),
        public skipBasicCheck: boolean = false,
        public skipReason: string = '',
        public requestTime: u32 = 0, // seconds since epoch
    ) {
        super();
    }

    @primary
    get primary(): u64 {
        return this.collection.N;
    }
}
