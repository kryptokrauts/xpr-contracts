import { ActionData, InlineAction, Name, PermissionLevel } from 'proton-tsc';

/* LogBlacklistReview as ActionData */
@packer
export class LogBlacklistReview extends ActionData {
    constructor(
        public collection: Name = new Name(),
        public reporter: Name = new Name(),
        public reportReason: string = '',
        public guard: Name = new Name(),
        public guardComment: string = '',
    ) {
        super();
    }
}

/* LogRevocation as ActionData */
@packer
export class LogRevocation extends ActionData {
    constructor(
        public collection: Name = new Name(),
        public guard: Name = new Name(),
        public guardComment: string = '',
    ) {
        super();
    }
}

/* LogShieldingReview as ActionData */
@packer
export class LogShieldingReview extends ActionData {
    constructor(
        public collection: Name = new Name(),
        public requestedBy: Name = new Name(),
        public skipBasicCheck: boolean = false,
        public skipReason: string = '',
        public guard: Name = new Name(),
        public reportCid: string = '',
    ) {
        super();
    }
}

/**
 * Send the lognewblist action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the collection that was added to blacklist
 * @param {Name} reporter - account of the reporter
 * @param {string} reportReason - reason for reporting the collection
 * @param {Name} guard - account of the guard
 * @param {string} guardComment - blacklisting info for the public
 */
export function sendLogNewBlacklistEntry(
    contractAndActor: Name,
    collection: Name,
    reporter: Name,
    reportReason: string,
    guard: Name,
    guardComment: string,
): void {
    const LOG_NEW_BLACKLIST_ENTRY = new InlineAction<LogBlacklistReview>('lognewblist');
    const action = LOG_NEW_BLACKLIST_ENTRY.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogBlacklistReview(collection, reporter, reportReason, guard, guardComment);
    action.send(actionParams);
}

/**
 * Send the logreportrej action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the collection that was rejected
 * @param {Name} reporter - account of the reporter
 * @param {string} reportReason - reason for reporting the collection
 * @param {Name} guard - account of the guard
 * @param {string} guardComment - rejection info for the public
 */
export function sendLogReportRejection(
    contractAndActor: Name,
    collection: Name,
    reporter: Name,
    reportReason: string,
    guard: Name,
    guardComment: string,
): void {
    const LOG_REPORT_REJECTION = new InlineAction<LogBlacklistReview>('logreportrej');
    const action = LOG_REPORT_REJECTION.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogBlacklistReview(collection, reporter, reportReason, guard, guardComment);
    action.send(actionParams);
}

/**
 * Send the logblistldel action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the collection that was removed from blacklist
 * @param {Name} guard - account of the guard
 * @param {string} guardComment - deletion info for the public
 */
export function sendLogBlacklistDeletion(
    contractAndActor: Name,
    collection: Name,
    guard: Name,
    guardComment: string,
): void {
    const LOG_BLACKLIST_DELETION = new InlineAction<LogRevocation>('logblistldel');
    const action = LOG_BLACKLIST_DELETION.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogRevocation(collection, guard, guardComment);
    action.send(actionParams);
}

/**
 * Send the lognewshield action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the collection that was shielded
 * @param {Name} requestedBy - account of the requester
 * @param {boolean} skipBasicCheck - info if skip of basic check was requested
 * @param {string} skipReason - reason why basic check was skipped
 * @param {Name} confirmedBy - account of the guard
 * @param {string} reportCid - ipfs hash/cid of the shielding report
 */
export function sendLogNewShielding(
    contractAndActor: Name,
    collection: Name,
    requestedBy: Name,
    skipBasicCheck: boolean,
    skipReason: string,
    confirmedBy: Name,
    reportCid: string,
): void {
    const LOG_NEW_SHIELDING_ENTRY = new InlineAction<LogShieldingReview>('lognewshield');
    const action = LOG_NEW_SHIELDING_ENTRY.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogShieldingReview(
        collection,
        requestedBy,
        skipBasicCheck,
        skipReason,
        confirmedBy,
        reportCid,
    );
    action.send(actionParams);
}

/**
 * Send the logshieldrej action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the collection that was rejected
 * @param {Name} requestedBy - account of the requester
 * @param {boolean} skipBasicCheck - info if skip of basic check was requested
 * @param {string} skipReason - reason why basic check should be skipped
 * @param {Name} rejectedBy - account of the guard
 * @param {string} reportCid - ipfs hash/cid of the shielding report
 */
export function sendLogShieldRejection(
    contractAndActor: Name,
    collection: Name,
    requestedBy: Name,
    skipBasicCheck: boolean,
    skipReason: string,
    rejectedBy: Name,
    reportCid: string,
): void {
    const LOG_SHIELD_REJECTION = new InlineAction<LogShieldingReview>('logshieldrej');
    const action = LOG_SHIELD_REJECTION.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogShieldingReview(
        collection,
        requestedBy,
        skipBasicCheck,
        skipReason,
        rejectedBy,
        reportCid,
    );
    action.send(actionParams);
}

/**
 * Send the logshielddel action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 * @param {Name} collection - name/id of the collection that was removed from shieldings
 * @param {Name} guard - account of the guard
 * @param {string} guardComment - deletion info for the public
 */
export function sendLogShieldingDeletion(
    contractAndActor: Name,
    collection: Name,
    guard: Name,
    guardComment: string,
): void {
    const LOG_SHIELDING_DELETION = new InlineAction<LogRevocation>('logshielddel');
    const action = LOG_SHIELDING_DELETION.act(contractAndActor, new PermissionLevel(contractAndActor));
    const actionParams = new LogRevocation(collection, guard, guardComment);
    action.send(actionParams);
}
