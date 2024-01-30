import { Name, Table } from 'proton-tsc';

@table('blacklist', noabigen)
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

@table('shieldings', noabigen)
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
