import {
    Asset,
    Contract,
    EMPTY_NAME,
    Name,
    Singleton,
    TableStore,
    check,
    currentTimeSec,
    isAccount,
    requireAuth,
} from 'proton-tsc';
import { XPR_SYMBOL } from 'proton-tsc/system';
import { sendTransferToken } from 'proton-tsc/token';
import { ATOMICASSETS_CONTRACT, Collections } from 'proton-tsc/atomicassets';
import { Balance, Blacklist, BlacklistReport, Globals, ShieldingRequest, Shielding } from './nftwatchdao.tables';
import {
    ERROR_COLLECTION_ALREADY_BLACKLISTED,
    ERROR_COLLECTION_ALREADY_REPORTED,
    ERROR_COLLECTION_ALREADY_SHIELDED,
    ERROR_COLLECTION_NOT_BLACKLISTED,
    ERROR_COLLECTION_NOT_EXISTS,
    ERROR_COLLECTION_NOT_REPORTED,
    ERROR_COLLECTION_NOT_SHIELDED,
    ERROR_INSUFFICIENT_SHIELDING_BALANCE,
    ERROR_INVALID_CID,
    ERROR_INVALID_FEE_STRUCTURE,
    ERROR_INVALID_MARKETPLACE,
    ERROR_INVALID_SHIELDING_PRICE,
    ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED,
    ERROR_ACCOUNT_NOT_EXISTS,
    ERROR_MARKETPLACE_ALREADY_REGISTERED,
    ERROR_MISSING_SHIELDING_BALANCE,
    ERROR_SHIELDING_ALREADY_REQUESTED,
    ERROR_SHIELDING_REQUEST_NOT_EXISTS,
    XPR_TOKEN_CONTRACT,
    ERROR_GUARD_ALREADY_AUTHORIZED,
    ERROR_UNAUTHORIZED_GUARD,
} from './nftwatchdao.constants';
import {
    sendLogBlacklistDeletion,
    sendLogNewBlacklistEntry,
    sendLogNewShielding,
    sendLogReportRejection,
    sendLogShieldRejection,
    sendLogShieldingDeletion,
} from './nftwatchdao.inline';

@contract
class NftWatchDao extends Contract {
    contract: Name = this.receiver;

    // globals singleton table
    globalsSingleton: Singleton<Globals> = new Singleton<Globals>(this.receiver);

    // nftwatchdao tables
    balances: TableStore<Balance> = new TableStore<Balance>(this.receiver);
    blacklist: TableStore<Blacklist> = new TableStore<Blacklist>(this.receiver);
    shieldings: TableStore<Shielding> = new TableStore<Shielding>(this.receiver);
    blacklistReports: TableStore<BlacklistReport> = new TableStore<BlacklistReport>(this.receiver);
    shieldingRequests: TableStore<ShieldingRequest> = new TableStore<ShieldingRequest>(this.receiver);

    // atomicassets tables
    aaCollections: TableStore<Collections> = new TableStore<Collections>(ATOMICASSETS_CONTRACT);

    /**
     * Configures the shielding price in XPR.
     * @param {Asset} xprPrice - price for shielding
     * @throws if authorization of contract is missing
     */
    @action('setshieldprc')
    setShieldingPrice(xprPrice: Asset): void {
        requireAuth(this.contract);
        check(xprPrice.symbol == XPR_SYMBOL, ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED);
        const globals = this.globalsSingleton.get();
        globals.shieldingPrice = xprPrice;
        this.globalsSingleton.set(globals, this.contract);
    }

    /**
     * Configures the fee distribution of the shielding costs.
     * @param {u8} guard - guard fee percentage
     * @param {u8} dao - dao fee percentage
     * @param {u8} market - market fee percentage
     * @throws if authorization of contract is missing
     * @throws if the sum of percentages does not match 100
     */
    @action('setfeestruct')
    setFeeDistribution(guard: u8, dao: u8, market: u8): void {
        requireAuth(this.contract);
        check(guard + dao + market == 100, ERROR_INVALID_FEE_STRUCTURE);
        const globals = this.globalsSingleton.get();
        globals.shieldingGuardFee = guard;
        globals.shieldingDaoFee = dao;
        globals.shieldingMarketFee = market;
        this.globalsSingleton.set(globals, this.contract);
    }

    /**
     * Adds a guard to the authorizedGuards in globals table.
     * @param {Name} guard - account of the guard to authorize
     * @throws if authorization of contract is missing
     * @throws if the guard account does not exist
     * @throws if the guard is already authorized
     */
    @action('addguard')
    addAuthorizedGuard(guard: Name): void {
        requireAuth(this.contract);
        check(isAccount(guard), ERROR_ACCOUNT_NOT_EXISTS);
        const globals = this.globalsSingleton.get();
        check(!globals.authorizedGuards.includes(guard), ERROR_GUARD_ALREADY_AUTHORIZED);
        globals.authorizedGuards.push(guard);
        this.globalsSingleton.set(globals, this.contract);
    }

    /**
     * Removes a guard from the authorizedGuards in globals table.
     * @param {Name} guard - account of the guard to authorize
     * @throws if authorization of contract is missing
     */
    @action('delguard')
    delAuthorizedGuard(guard: Name): void {
        requireAuth(this.contract);
        const globals = this.globalsSingleton.get();
        const index = globals.authorizedGuards.indexOf(guard);
        if (index != -1) {
            globals.authorizedGuards.splice(index, 1);
            this.globalsSingleton.set(globals, this.contract);
        }
    }

    /**
     * Adds a market to the list of marketplaces that support shielding in globals table.
     * @param {Name} marketplace - account of the marketplace to add
     * @throws if authorization of contract is missing
     * @throws if marketplace account does not exist
     * @throws if marketplace is already registered
     */
    @action('addmarket')
    addMarket(marketplace: Name): void {
        requireAuth(this.contract);
        check(isAccount(marketplace), ERROR_ACCOUNT_NOT_EXISTS);
        const globals = this.globalsSingleton.get();
        check(!globals.marketplaces.includes(marketplace), ERROR_MARKETPLACE_ALREADY_REGISTERED);
        globals.marketplaces.push(marketplace);
        this.globalsSingleton.set(globals, this.contract);
    }

    /**
     * Reports a collection to be added to the blacklist.
     * Adds a new entry to the blacklistrep table.
     * @param {Name} collection - name/id of the collection to be added to report for blacklist
     * @param {Name} reporter - account of the reporter
     * @param {string} reason - reason why the collection should be blacklisted
     * @throws if authorization of reporter is missing
     * @throws if collection does not exist
     * @throws if collection is already blacklisted
     * @throws if collection is already reported
     */
    @action('report')
    reportCollection(collection: Name, reporter: Name, reason: string): void {
        requireAuth(reporter);
        check(this.aaCollections.exists(collection.N), ERROR_COLLECTION_NOT_EXISTS);
        check(this.blacklist.get(collection.N) == null, ERROR_COLLECTION_ALREADY_BLACKLISTED);
        check(this.blacklistReports.get(collection.N) == null, ERROR_COLLECTION_ALREADY_REPORTED);
        const report = new BlacklistReport(collection, reporter, reason, currentTimeSec());
        this.blacklistReports.store(report, reporter); // reporter will pay the ram
    }

    /**
     * Confirms a reported collection.
     * Removes the entry in the blacklistrep table.
     * Adds a new entry in the blacklist table.
     * Increments the blacklist count in globals table.
     * Triggers logging of the new blacklist entry.
     * @param {Name} collection - name/id of the collection to be added to blacklist
     * @param {Name} guard - account of the guard
     * @param {string} comment - blacklisting info for the public
     * @throws if authorization of guard is missing
     * @throws if guard is not authorized
     * @throws if collection is not reported
     */
    @action('confirmrep')
    confirmCollectionReport(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const report = this.blacklistReports.requireGet(collection.N, ERROR_COLLECTION_NOT_REPORTED);
        const blacklistEntry = new Blacklist(
            collection,
            report.reportReason,
            report.reportedBy,
            guard,
            comment,
            currentTimeSec(),
        );
        sendLogNewBlacklistEntry(this.contract, collection, report.reportedBy, report.reportReason, guard, comment);
        this.blacklistReports.remove(report);
        this.blacklist.store(blacklistEntry, this.contract);
        globals.blacklistCount++;
        this.globalsSingleton.set(globals, this.contract);
    }

    /**
     * Adds a collection directly to the blacklist.
     * Adds a new entry to the blacklist table.
     * Increments the blacklist count in globals table.
     * Triggers logging of the new blacklist entry.
     * @param {Name} collection - name/id of the collection to be added to blacklist
     * @param {Name} guard - account of the guard
     * @param {string} comment - blacklisting info for the public
     * @throws if authorization of guard is missing
     * @throws if guard is not authorized
     * @throws if collection does not exist
     * @throws if collection is already blacklisted
     */
    @action('addblacklist')
    addToBlacklist(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        check(this.aaCollections.exists(collection.N), ERROR_COLLECTION_NOT_EXISTS);
        check(this.blacklist.get(collection.N) == null, ERROR_COLLECTION_ALREADY_BLACKLISTED);
        const blacklistEntry = new Blacklist(collection, '', EMPTY_NAME, guard, comment, currentTimeSec());
        this.blacklist.store(blacklistEntry, this.contract);
        globals.blacklistCount++;
        this.globalsSingleton.set(globals, this.contract);
        sendLogNewBlacklistEntry(this.contract, collection, EMPTY_NAME, '', guard, comment);
    }

    /**
     * Logs a new blacklist entry.
     * @param {Name} collection - name/id of the collection to be added to blacklist
     * @param {Name} reporter - account of the reporter
     * @param {string} reportReason - reason for reporting
     * @param {Name} guard - account of the guard
     * @param {string} guardComment - blacklisting info for the public
     * @throws if authorization of contract is missing
     */
    @action('lognewblist')
    logNewBlacklistEntry(
        collection: Name,
        reporter: Name,
        reportReason: string,
        guard: Name,
        guardComment: string,
    ): void {
        requireAuth(this.contract);
    }

    /**
     * Rejects a blacklist report.
     * Removes the entry from blacklistrep table.
     * Triggers logging of report rejection.
     * @param {Name} collection - name/id of the collection where blacklist report was rejected
     * @param {Name} guard - account of the guard
     * @param {string} comment - rejection info for the public
     * @throws if authorization of guard is missing
     * @throws if collection is not reported
     */
    @action('rejectreport')
    rejectCollectionReport(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const report = this.blacklistReports.requireGet(collection.N, ERROR_COLLECTION_NOT_REPORTED);
        sendLogReportRejection(this.contract, collection, report.reportedBy, report.reportReason, guard, comment);
        this.blacklistReports.remove(report); // clean the report table
    }

    /**
     * Logs a report rejection.
     * @param {Name} collection - name/id of the collection to be added to blacklist
     * @param {Name} reporter - account of the reporter
     * @param {string} reportReason - reason for reporting
     * @param {Name} guard - account of the guard
     * @param {string} guardComment - rejection info for the public
     * @throws if authorization of contract is missing
     */
    @action('logreportrej')
    logReportRejection(
        collection: Name,
        reporter: Name,
        reportReason: string,
        guard: Name,
        guardComment: string,
    ): void {
        requireAuth(this.contract);
    }

    /**
     * Removes collection from blacklist.
     * Decrements the blacklist count in globals table.
     * Triggers logging of blacklist deletion.
     * @param {Name} collection - name/id of the collection to remove
     * @param {Name} guard - account of the guard
     * @param {string} comment - deletion info for the public
     * @throws if authorization of guard is missing
     * @throws if collection is not blacklisted
     */
    @action('delblacklist')
    deleteFromBlacklist(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const blacklistEntry = this.blacklist.requireGet(collection.N, ERROR_COLLECTION_NOT_BLACKLISTED);
        globals.blacklistCount--;
        this.globalsSingleton.set(globals, this.contract);
        this.blacklist.remove(blacklistEntry);
        sendLogBlacklistDeletion(this.contract, collection, guard, comment);
    }

    /**
     * Logs a blacklist deletion.
     * @param {Name} collection - name/id of the collection that was removed
     * @param {Name} guard - account of the guard
     * @param {string} guardComment - deletion info for the public
     * @throws if authorization of contract is missing
     */
    @action('logblistldel')
    logBlacklistDeletion(collection: Name, guard: Name, guardComment: string): void {
        requireAuth(this.contract);
    }

    /**
     * Request shielding for a collection.
     * Adds an entry to the shieldingreq table.
     * Forwards portion of the shielding costs to the marketplace where the request was submitted from.
     * @param {Name} collection - name/id of the collection where blacklist report was rejected
     * @param {Name} requester - account of the requester
     * @param {Name} requestMarketplace - account of the marketplace that was used to request shielding
     * @param {boolean} skipBasicCheck - whether the basic check shall be skipped
     * @param {string} skipReason - reason why basic check shall be skipped
     * @throws if authorization of requester is missing
     * @throws if collection is does not exist
     * @throws if the provided marketplace is not supported
     * @throws if the collection is already blacklisted
     * @throws if the collection is already reported
     * @throws if the collection is already shielded
     * @throws if shielding is already requested for the collection
     */
    @action('reqshielding')
    requestShielding(
        collection: Name,
        requester: Name,
        requestMarketplace: Name,
        skipBasicCheck: boolean = false,
        skipReason: string = '',
    ): void {
        // general checks
        requireAuth(requester);
        check(this.aaCollections.exists(collection.N), ERROR_COLLECTION_NOT_EXISTS);
        const globals = this.globalsSingleton.get();
        check(globals.marketplaces.includes(requestMarketplace), ERROR_INVALID_MARKETPLACE);
        check(!this.blacklist.exists(collection.N), ERROR_COLLECTION_ALREADY_BLACKLISTED);
        check(!this.blacklistReports.exists(collection.N), ERROR_COLLECTION_ALREADY_REPORTED);
        check(!this.shieldings.exists(collection.N), ERROR_COLLECTION_ALREADY_SHIELDED);
        check(!this.shieldingRequests.exists(collection.N), ERROR_SHIELDING_ALREADY_REQUESTED);
        // check for sufficient balance
        const requesterBalance = this.balances.requireGet(requester.N, ERROR_MISSING_SHIELDING_BALANCE);
        check(Asset.gte(requesterBalance.xpr, globals.shieldingPrice), ERROR_INSUFFICIENT_SHIELDING_BALANCE);
        // update balance of requester
        requesterBalance.xpr = Asset.sub(requesterBalance.xpr, globals.shieldingPrice);
        this.balances.set(requesterBalance, requester);
        // forward shielding fee to market
        const marketFeeAmount = (globals.shieldingPrice.amount * globals.shieldingMarketFee) / 100;
        sendTransferToken(
            Name.fromString(XPR_TOKEN_CONTRACT),
            this.contract,
            requestMarketplace,
            new Asset(marketFeeAmount, XPR_SYMBOL),
            `shielding fee: ${collection}`,
        );
        // store new shielding request
        const shieldingRequest = new ShieldingRequest(
            collection,
            requester,
            globals.shieldingPrice,
            requestMarketplace,
            skipBasicCheck,
            skipReason,
            currentTimeSec(),
        );
        this.shieldingRequests.store(shieldingRequest, requester);
    }

    /**
     * Confirms a shielding for a collection.
     * Removes the entry in the shieldingreq table.
     * Forwards a portion of the shielding costs to the guard.
     * Adds a new entry in the shielding table.
     * Increments the shield count in globals table.
     * Triggers logging of the new shielding entry.
     * @param {Name} collection - name/id of the collection to be added to shieldings
     * @param {Name} guard - account of the guard
     * @param {string} reportCid - ipfs hash/cid of the shielding report
     * @throws if authorization of guard is missing
     * @throws if guard is not authorized
     * @throws if shielding is not requested for the collection
     */
    @action('confshield')
    confirmShielding(collection: Name, guard: Name, reportCid: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const request = this.shieldingRequests.requireGet(collection.N, ERROR_SHIELDING_REQUEST_NOT_EXISTS);
        this.handleShieldingReview(request, guard, reportCid);
        const shielding = new Shielding(collection, request.requestedBy, guard, reportCid, currentTimeSec());
        this.shieldings.store(shielding, this.contract);
        globals.shieldCount++;
        this.globalsSingleton.set(globals, this.contract);
        sendLogNewShielding(
            this.contract,
            collection,
            request.requestedBy,
            request.skipBasicCheck,
            request.skipReason,
            guard,
            reportCid,
        );
    }

    /**
     * Adds a collection directly to the shieldings.
     * Adds a new entry to the shieldings table.
     * Increments the shield count in globals table.
     * Triggers logging of the new shielding entry.
     * @param {Name} collection - name/id of the collection to be added to shieldings
     * @param {Name} guard - account of the guard
     * @param {string} skipReason - skip reason for the public
     * @param {string} reportCid - ipfs hash/cid of the shielding report
     * @throws if authorization of guard is missing
     * @throws if guard is not authorized
     * @throws if collection does not exist
     * @throws if collection is already blacklisted
     * @throws if collection is already reported
     * @throws if collection is already shielded
     * @throws if shielding is already requested for the collection
     * @throws if reportCid is invalid
     */
    @action('addshielding')
    addShielding(collection: Name, guard: Name, skipReason: string, reportCid: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        check(this.aaCollections.exists(collection.N), ERROR_COLLECTION_NOT_EXISTS);
        check(!this.blacklist.exists(collection.N), ERROR_COLLECTION_ALREADY_BLACKLISTED);
        check(!this.blacklistReports.exists(collection.N), ERROR_COLLECTION_ALREADY_REPORTED);
        check(!this.shieldings.exists(collection.N), ERROR_COLLECTION_ALREADY_SHIELDED);
        check(!this.shieldingRequests.exists(collection.N), ERROR_SHIELDING_ALREADY_REQUESTED);
        check(reportCid.startsWith('Qm') || reportCid.startsWith('bafy'), ERROR_INVALID_CID);
        const shielding = new Shielding(collection, EMPTY_NAME, guard, reportCid, currentTimeSec());
        this.shieldings.store(shielding, this.contract);
        globals.shieldCount++;
        this.globalsSingleton.set(globals, this.contract);
        sendLogNewShielding(this.contract, collection, EMPTY_NAME, true, skipReason, guard, reportCid);
    }

    /**
     * Logs a new shielding.
     * @param {Name} collection - name/id of the collection that was shielded
     * @param {Name} requestedBy - account of the requester
     * @param {boolean} skipBasicCheck - info if skipping basic check was requested
     * @param {string} skipReason - potential skip reason
     * @param {Name} confirmedBy - account of the guard that confirmed shielding
     * @param {string} reportCid - ipfs hash/cid of the shielding report
     * @throws if authorization of contract is missing
     */
    @action('lognewshield')
    logNewShieldingEntry(
        collection: Name,
        requestedBy: Name,
        skipBasicCheck: boolean,
        skipReason: string,
        confirmedBy: Name,
        reportCid: string,
    ): void {
        requireAuth(this.contract);
    }

    /**
     * Rejects shielding for a collection.
     * Removes the entry in the shieldingreq table.
     * Forwards a portion of the shielding costs to the guard.
     * Triggers logging of the shielding rejection.
     * @param {Name} collection - name/id of the collection to be rejected
     * @param {Name} guard - account of the guard
     * @param {string} reportCid - ipfs hash/cid of the shielding report
     * @throws if authorization of guard is missing
     * @throws if guard is not authorized
     * @throws if shielding is not requested for the collection
     */
    @action('rejectshield')
    rejectShielding(collection: Name, guard: Name, reportCid: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const request = this.shieldingRequests.requireGet(collection.N, ERROR_SHIELDING_REQUEST_NOT_EXISTS);
        this.handleShieldingReview(request, guard, reportCid);
        sendLogShieldRejection(
            this.contract,
            collection,
            request.requestedBy,
            request.skipBasicCheck,
            request.skipReason,
            guard,
            reportCid,
        );
    }

    /**
     * Logs rejection of a shielding request.
     * @param {Name} collection - name/id of the collection that was rejected
     * @param {Name} requestedBy - account of the requester
     * @param {boolean} skipBasicCheck - info if skipping basic check was requested
     * @param {string} skipReason - potential skip reason
     * @param {Name} rejectedBy - account of the guard that rejected shielding
     * @param {string} reportCid - ipfs hash/cid of the shielding report
     * @throws if authorization of contract is missing
     */
    @action('logshieldrej')
    logShieldingRejection(
        collection: Name,
        requestedBy: Name,
        skipBasicCheck: boolean,
        skipReason: string,
        rejectedBy: Name,
        reportCid: string,
    ): void {
        requireAuth(this.contract);
    }

    /**
     * Removes collection from shieldings.
     * Decrements the shield count in globals table.
     * Triggers logging of shielding deletion.
     * @param {Name} collection - name/id of the collection to remove
     * @param {Name} guard - account of the guard
     * @param {string} comment - deletion info for the public
     * @throws if authorization of guard is missing
     * @throws if collection is not shielded
     */
    @action('delshielding')
    deleteShielding(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const shieldingEntry = this.shieldings.requireGet(collection.N, ERROR_COLLECTION_NOT_SHIELDED);
        globals.shieldCount--;
        this.globalsSingleton.set(globals, this.contract);
        this.shieldings.remove(shieldingEntry);
        sendLogShieldingDeletion(this.contract, collection, guard, comment);
    }

    /**
     * Logs deletion of a shielding.
     * @param {Name} collection - name/id of the collection where shielding was removed
     * @param {Name} guard - account of the guard
     * @param {string} guardComment - deletion info for the public
     * @throws if authorization of contract is missing
     */
    @action('logshielddel')
    logShieldingDeletion(collection: Name, guard: Name, guardComment: string): void {
        requireAuth(this.contract);
    }

    /**
     * Handles an incoming transfer notification to check for valid deposit of shielding costs.
     * @throws if the incoming XPR transfer has memo 'shielding' but does not match the shielding costs
     */
    @action('transfer', notify)
    onDeposit(from: Name, to: Name, quantity: Asset, memo: string): void {
        // skip if outgoing
        if (from == this.contract) {
            return;
        }
        // only handle incoming XPR transfers with shielding memo
        if (
            to == this.contract &&
            this.firstReceiver == Name.fromString(XPR_TOKEN_CONTRACT) &&
            quantity.symbol == XPR_SYMBOL &&
            memo == 'shielding'
        ) {
            check(quantity == this.globalsSingleton.get().shieldingPrice, ERROR_INVALID_SHIELDING_PRICE);
            this.addXprBalance(from, quantity);
        }
    }

    /**
     * Handles shielding review.
     * Forwards portion of the shielding costs to the guard.
     * Removes entry from shieldingreq table.
     * @throws if reportCid is invalid
     */
    handleShieldingReview(request: ShieldingRequest, guard: Name, reportCid: string): void {
        check(reportCid.startsWith('Qm') || reportCid.startsWith('bafy'), ERROR_INVALID_CID);
        const globals = this.globalsSingleton.get();
        const guardFeeAmount = (request.requestPrice.amount * globals.shieldingGuardFee) / 100;
        sendTransferToken(
            Name.fromString(XPR_TOKEN_CONTRACT),
            this.contract,
            guard,
            new Asset(guardFeeAmount, XPR_SYMBOL),
            `shielding fee: ${request.collection}`,
        );
        this.shieldingRequests.remove(request);
    }

    /**
     * Adds XPR balance of a user to the balances table.
     * @param {Name} actor - account of the user to track balance
     * @param {Asset} xpr - amount of XPR to add to the balance
     */
    addXprBalance(actor: Name, xpr: Asset): void {
        let account = this.balances.get(actor.N);
        if (!account) {
            account = new Balance(actor);
        }
        account.xpr = Asset.add(account.xpr, xpr);
        this.balances.set(account, this.contract);
    }
}
