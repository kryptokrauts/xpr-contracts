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

    @action('setshieldprc')
    setShieldingPrice(xprPrice: Asset): void {
        requireAuth(this.contract);
        check(xprPrice.symbol == XPR_SYMBOL, ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED);
        const globals = this.globalsSingleton.get();
        globals.shieldingPrice = xprPrice;
        this.globalsSingleton.set(globals, this.contract);
    }

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

    @action('addguard')
    addAuthorizedGuard(guard: Name): void {
        requireAuth(this.contract);
        check(isAccount(guard), ERROR_ACCOUNT_NOT_EXISTS);
        const globals = this.globalsSingleton.get();
        check(!globals.authorizedGuards.includes(guard), ERROR_GUARD_ALREADY_AUTHORIZED);
        globals.authorizedGuards.push(guard);
        this.globalsSingleton.set(globals, this.contract);
    }

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

    @action('addmarket')
    addMarket(marketplace: Name): void {
        requireAuth(this.contract);
        check(isAccount(marketplace), ERROR_ACCOUNT_NOT_EXISTS);
        const globals = this.globalsSingleton.get();
        check(!globals.marketplaces.includes(marketplace), ERROR_MARKETPLACE_ALREADY_REGISTERED);
        globals.marketplaces.push(marketplace);
        this.globalsSingleton.set(globals, this.contract);
    }

    @action('report')
    reportCollection(collection: Name, reporter: Name, reason: string): void {
        requireAuth(reporter);
        check(this.aaCollections.exists(collection.N), ERROR_COLLECTION_NOT_EXISTS);
        check(this.blacklist.get(collection.N) == null, ERROR_COLLECTION_ALREADY_BLACKLISTED);
        check(this.blacklistReports.get(collection.N) == null, ERROR_COLLECTION_ALREADY_REPORTED);
        const report = new BlacklistReport(collection, reporter, reason, currentTimeSec());
        this.blacklistReports.store(report, reporter); // reporter will pay the ram
    }

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

    @action('addblacklist')
    addToBlacklist(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const blacklistEntry = new Blacklist(collection, '', EMPTY_NAME, guard, comment, currentTimeSec());
        this.blacklist.store(blacklistEntry, this.contract);
        globals.blacklistCount++;
        this.globalsSingleton.set(globals, this.contract);
        sendLogNewBlacklistEntry(this.contract, collection, EMPTY_NAME, '', guard, comment);
    }

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

    @action('rejectreport')
    rejectCollectionReport(collection: Name, guard: Name, comment: string): void {
        requireAuth(guard);
        const globals = this.globalsSingleton.get();
        check(globals.authorizedGuards.includes(guard), ERROR_UNAUTHORIZED_GUARD);
        const report = this.blacklistReports.requireGet(collection.N, ERROR_COLLECTION_NOT_REPORTED);
        sendLogReportRejection(this.contract, collection, report.reportedBy, report.reportReason, guard, comment);
        this.blacklistReports.remove(report); // clean the report table
    }

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

    @action('logblistldel')
    logBlacklistDeletion(collection: Name, guard: Name, guardComment: string): void {
        requireAuth(this.contract);
    }

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

    @action('logshielddel')
    logShieldingDeletion(collection: Name, guard: Name, guardComment: string): void {
        requireAuth(this.contract);
    }

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

    addXprBalance(actor: Name, xpr: Asset): void {
        let account = this.balances.get(actor.N);
        if (!account) {
            account = new Balance(actor);
        }
        account.xpr = Asset.add(account.xpr, xpr);
        this.balances.set(account, actor);
    }
}
