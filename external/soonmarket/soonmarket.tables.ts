import { Table, Name, EMPTY_NAME } from 'proton-tsc';

@table('globals', singleton, noabigen)
export class Globals extends Table {
    constructor(
        public blacklistCount: u64 = 0,
        public verifiedCount: u64 = 0,
        public silverPromoCount: u64 = 0,
        public goldPromoCount: u64 = 0,
        public silverPromoDuration: u32 = 0,
        public goldPromoDuration: u32 = 0,
        public spotCollection: Name = EMPTY_NAME,
        public goldSpotId: u64 = 0,
        public silverSpotTemplateId: u32 = 0,
    ) {
        super();
    }
}
