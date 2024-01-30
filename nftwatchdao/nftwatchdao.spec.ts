import { expect } from 'chai';
import { Account, Blockchain, expectToThrow, mintTokens, nameToBigInt, symbolCodeToBigInt } from '@proton/vert';
import { Asset, Name } from '@greymass/eosio';
import {
    COLLECTION_CYPHER_GANG,
    COLLECTION_PIXELHEROES,
    TOKEN_XPR,
    eosio_assert,
    getTokenAmountActionParam,
} from '../helpers/common.ts';
import { createTestCollection } from '../helpers/atomicassets.helper.ts';
import {
    ERROR_ACCOUNT_NOT_EXISTS,
    ERROR_COLLECTION_ALREADY_BLACKLISTED,
    ERROR_COLLECTION_ALREADY_REPORTED,
    ERROR_COLLECTION_NOT_BLACKLISTED,
    ERROR_COLLECTION_NOT_EXISTS,
    ERROR_COLLECTION_NOT_REPORTED,
    ERROR_COLLECTION_NOT_SHIELDED,
    ERROR_GUARD_ALREADY_AUTHORIZED,
    ERROR_INSUFFICIENT_SHIELDING_BALANCE,
    ERROR_INVALID_CID,
    ERROR_INVALID_FEE_STRUCTURE,
    ERROR_INVALID_MARKETPLACE,
    ERROR_INVALID_SHIELDING_PRICE,
    ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED,
    ERROR_MARKETPLACE_ALREADY_REGISTERED,
    ERROR_MISSING_SHIELDING_BALANCE,
    ERROR_SHIELDING_REQUEST_NOT_EXISTS,
} from './nftwatchdao.constants.ts';
import { Blacklist, BlacklistReport, Globals, Shielding, ShieldingRequest } from './nftwatchdao.tables.ts';

const blockchain = new Blockchain();

// deploy contract to test
const nftwatchdao = blockchain.createContract('nftwatchdao', 'nftwatchdao/target/nftwatchdao.contract');

// deploy contracts required for testing
const eosioToken = blockchain.createContract('eosio.token', 'node_modules/proton-tsc/external/eosio.token/eosio.token');
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets');

// globals table
const getGlobals = (): Globals => nftwatchdao.tables.globals().getTableRows()[0];

// create accounts
const [soonmarket, protonpunk, pixelheroes, reporter, requester, stonebreaker, randomacc] = blockchain.createAccounts(
    'soonmarket',
    'protonpunk',
    'pixelheroes',
    'reporter',
    'requester',
    'stonebreaker',
    'randomacc',
);

let initSnapshot: number;

// helpers
const initContracts = async (...contracts: Array<Account>): Promise<void> => {
    for (const contract of contracts) {
        await contract.actions.init().send();
    }
};

const getAccountXprBalance = (account: Account) => {
    const accountBigInt = nameToBigInt(account.name);
    const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from('XPR'));
    return eosioToken.tables.accounts(accountBigInt).getTableRow(symcodeBigInt);
};

before(async () => {
    // init contracts
    await initContracts(atomicassets);
    // add stonebreaker as authorized guard
    await nftwatchdao.actions.addguard([stonebreaker.name]).send(`${nftwatchdao.name}@active`);
    // mint xpr
    await mintTokens(eosioToken, TOKEN_XPR.name, TOKEN_XPR.precision, 100_000_000.0, 10_000_000, [requester]);
    // create collections
    await createTestCollection(atomicassets, protonpunk);
    await createTestCollection(atomicassets, pixelheroes);
    initSnapshot = blockchain.store.snapshot();
});

beforeEach(async () => {
    blockchain.store.revertTo(initSnapshot);
});

describe('NftWatchDAO', () => {
    describe('blacklisting', () => {
        it('reject blacklisting', async () => {
            await nftwatchdao.actions
                .report([COLLECTION_PIXELHEROES, reporter.name, 'creator left the space'])
                .send(`${reporter.name}@active`);
            let reportEntry: BlacklistReport = nftwatchdao.tables
                .blacklistrep()
                .getTableRow(nameToBigInt(COLLECTION_PIXELHEROES));
            expect(reportEntry).not.undefined;
            await nftwatchdao.actions
                .rejectreport([COLLECTION_PIXELHEROES, stonebreaker.name, 'not a valid reason to blacklist'])
                .send(`${stonebreaker.name}@active`);
            reportEntry = nftwatchdao.tables.blacklistrep().getTableRow(nameToBigInt(COLLECTION_PIXELHEROES));
            expect(reportEntry).undefined;
            expect(getGlobals().blacklistCount).equal(0);
        });
        it('confirm & delete blacklisting', async () => {
            const REPORT_REASON = 'fake copy scam';
            const GUARD_COMMENT = 'confirming a fake copy scam';
            await nftwatchdao.actions
                .report([COLLECTION_PIXELHEROES, reporter.name, REPORT_REASON])
                .send(`${reporter.name}@active`);
            let reportEntry = nftwatchdao.tables.blacklistrep().getTableRow(nameToBigInt(COLLECTION_PIXELHEROES));
            expect(reportEntry).not.undefined;
            await nftwatchdao.actions
                .confirmrep([COLLECTION_PIXELHEROES, stonebreaker.name, GUARD_COMMENT])
                .send(`${stonebreaker.name}@active`);
            reportEntry = nftwatchdao.tables.blacklistrep().getTableRow(nameToBigInt(COLLECTION_PIXELHEROES));
            expect(reportEntry).undefined;
            let blacklistEntry: Blacklist = nftwatchdao.tables
                .blacklist()
                .getTableRow(nameToBigInt(COLLECTION_PIXELHEROES));
            expect(blacklistEntry).not.undefined;
            expect(blacklistEntry.reportReason).equal(REPORT_REASON);
            expect(blacklistEntry.reportedBy).equal(reporter.name.toString());
            expect(blacklistEntry.guardComment).equal(GUARD_COMMENT);
            expect(blacklistEntry.confirmedBy).equal(stonebreaker.name.toString());
            expect(getGlobals().blacklistCount).equal(1);
            await nftwatchdao.actions
                .delblacklist([
                    COLLECTION_PIXELHEROES,
                    stonebreaker.name,
                    'fake copies have been burned. collection is clean.',
                ])
                .send(`${stonebreaker.name}@active`);
            blacklistEntry = nftwatchdao.tables.blacklist().getTableRow(nameToBigInt(COLLECTION_PIXELHEROES));
            expect(blacklistEntry).undefined;
            expect(getGlobals().blacklistCount).equal(0);
        });
    });
    describe('shielding', () => {
        it('reject shielding', async () => {
            const SHIELDING_PRICE = 12500;
            await eosioToken.actions
                .transfer([
                    requester.name,
                    nftwatchdao.name,
                    getTokenAmountActionParam(SHIELDING_PRICE, TOKEN_XPR),
                    'shielding',
                ])
                .send(`${requester.name}@active`);
            await nftwatchdao.actions
                .reqshielding([COLLECTION_CYPHER_GANG, requester.name, soonmarket.name, false, ''])
                .send(`${requester.name}@active`);
            let requestEntry: ShieldingRequest = nftwatchdao.tables
                .shieldingreq()
                .getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(requestEntry).not.undefined;
            // check fee distribution after request
            let guardAcc = getAccountXprBalance(stonebreaker);
            let marketAcc = getAccountXprBalance(soonmarket);
            let daoAcc = getAccountXprBalance(nftwatchdao);
            expect(guardAcc).undefined;
            expect(marketAcc.balance).equal(Asset.from((SHIELDING_PRICE * 10) / 100, '4,XPR').toString());
            expect(daoAcc.balance).equal(Asset.from((SHIELDING_PRICE * 90) / 100, '4,XPR').toString());
            await nftwatchdao.actions
                .rejectshield([COLLECTION_CYPHER_GANG, stonebreaker.name, 'Qm...'])
                .send(`${stonebreaker.name}@active`);
            requestEntry = nftwatchdao.tables.shieldingreq().getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(requestEntry).undefined;
            const shieldingEntry = nftwatchdao.tables.shieldings().getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(shieldingEntry).undefined;
            expect(getGlobals().shieldCount).equal(0);
            // check fee distribution after rejection
            guardAcc = getAccountXprBalance(stonebreaker);
            marketAcc = getAccountXprBalance(soonmarket);
            daoAcc = getAccountXprBalance(nftwatchdao);
            expect(guardAcc.balance).equal(Asset.from((SHIELDING_PRICE * 50) / 100, '4,XPR').toString());
            expect(marketAcc.balance).equal(Asset.from((SHIELDING_PRICE * 10) / 100, '4,XPR').toString());
            expect(daoAcc.balance).equal(Asset.from((SHIELDING_PRICE * 40) / 100, '4,XPR').toString());
        });
        it('confirm & delete shielding', async () => {
            const SHIELDING_PRICE = 12500;
            await eosioToken.actions
                .transfer([
                    requester.name,
                    nftwatchdao.name,
                    getTokenAmountActionParam(SHIELDING_PRICE, TOKEN_XPR),
                    'shielding',
                ])
                .send(`${requester.name}@active`);
            await nftwatchdao.actions
                .reqshielding([COLLECTION_CYPHER_GANG, requester.name, soonmarket.name, false, ''])
                .send(`${requester.name}@active`);
            let requestEntry: ShieldingRequest = nftwatchdao.tables
                .shieldingreq()
                .getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(requestEntry).not.undefined;
            // check fee distribution after request
            let guardAcc = getAccountXprBalance(stonebreaker);
            let marketAcc = getAccountXprBalance(soonmarket);
            let daoAcc = getAccountXprBalance(nftwatchdao);
            expect(guardAcc).undefined;
            expect(marketAcc.balance).equal(Asset.from((SHIELDING_PRICE * 10) / 100, '4,XPR').toString());
            expect(daoAcc.balance).equal(Asset.from((SHIELDING_PRICE * 90) / 100, '4,XPR').toString());
            await nftwatchdao.actions
                .confshield([COLLECTION_CYPHER_GANG, stonebreaker.name, 'bafy...'])
                .send(`${stonebreaker.name}@active`);
            requestEntry = nftwatchdao.tables.shieldingreq().getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(requestEntry).undefined;
            let shieldingEntry: Shielding = nftwatchdao.tables
                .shieldings()
                .getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(shieldingEntry).not.undefined;
            expect(shieldingEntry.requestedBy).equal(requester.name.toString());
            expect(shieldingEntry.confirmedBy).equal(stonebreaker.name.toString());
            expect(shieldingEntry.reportCid).equal('bafy...');
            expect(getGlobals().shieldCount).equal(1);
            // check fee distribution after confirmation
            guardAcc = getAccountXprBalance(stonebreaker);
            marketAcc = getAccountXprBalance(soonmarket);
            daoAcc = getAccountXprBalance(nftwatchdao);
            expect(guardAcc.balance).equal(Asset.from((SHIELDING_PRICE * 50) / 100, '4,XPR').toString());
            expect(marketAcc.balance).equal(Asset.from((SHIELDING_PRICE * 10) / 100, '4,XPR').toString());
            expect(daoAcc.balance).equal(Asset.from((SHIELDING_PRICE * 40) / 100, '4,XPR').toString());
            // delete shielding
            await nftwatchdao.actions
                .delshielding([
                    COLLECTION_CYPHER_GANG,
                    stonebreaker.name,
                    'community is concerned about the project. shielding must be revoked',
                ])
                .send(`${stonebreaker.name}@active`);
            shieldingEntry = nftwatchdao.tables.shieldings().getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(shieldingEntry).undefined;
            expect(getGlobals().shieldCount).equal(0);
        });
        it('add shielding directly without request', async () => {
            await nftwatchdao.actions
                .addshielding([
                    COLLECTION_CYPHER_GANG,
                    stonebreaker.name,
                    'has been shielded already before decentralized process',
                    'Qm...',
                ])
                .send(`${stonebreaker.name}@active`);
            let shieldingEntry: Shielding = nftwatchdao.tables
                .shieldings()
                .getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
            expect(shieldingEntry).not.undefined;
            expect(shieldingEntry.requestedBy).equal('');
            expect(shieldingEntry.confirmedBy).equal(stonebreaker.name.toString());
            expect(shieldingEntry.reportCid).equal('Qm...');
            expect(getGlobals().shieldCount).equal(1);
        });
    });
    describe('revert paths', () => {
        it('set invalid shielding price', async () => {
            // wrong asset
            await expectToThrow(
                nftwatchdao.actions.setshieldprc([Asset.from('5000.0000 LOAN')]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED),
            );
            // wrong precision
            await expectToThrow(
                nftwatchdao.actions.setshieldprc([Asset.from('25000.00001 XPR')]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_INVALID_SYMBOL_ONLY_XPR_ALLOWED),
            );
        });
        it('set invalid fee structure', async () => {
            // too low
            await expectToThrow(
                nftwatchdao.actions.setfeestruct([20, 20, 59]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_INVALID_FEE_STRUCTURE),
            );
            // too high
            await expectToThrow(
                nftwatchdao.actions.setfeestruct([20, 20, 61]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_INVALID_FEE_STRUCTURE),
            );
        });
        it('add non existing guard & marketplace', async () => {
            await expectToThrow(
                nftwatchdao.actions.addguard([Name.from('notexists')]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_ACCOUNT_NOT_EXISTS),
            );
            await expectToThrow(
                nftwatchdao.actions.addmarket([Name.from('notexists')]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_ACCOUNT_NOT_EXISTS),
            );
        });
        it('add a guard and marketplace twice', async () => {
            // stonebreaker has been added in initial setup
            await expectToThrow(
                nftwatchdao.actions.addguard([stonebreaker.name]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_GUARD_ALREADY_AUTHORIZED),
            );
            // soonmarket is added by default
            await expectToThrow(
                nftwatchdao.actions.addmarket([soonmarket.name]).send(`${nftwatchdao.name}@active`),
                eosio_assert(ERROR_MARKETPLACE_ALREADY_REGISTERED),
            );
        });
        it('request shield & report for non existing collection', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .reqshielding(['notexisits', requester.name, soonmarket.name, false, ''])
                    .send(`${requester.name}@active`),
                eosio_assert(ERROR_COLLECTION_NOT_EXISTS),
            );
            await expectToThrow(
                nftwatchdao.actions.report(['notexisits', reporter.name, '']).send(`${reporter.name}@active`),
                eosio_assert(ERROR_COLLECTION_NOT_EXISTS),
            );
        });
        it('request shield & report for already blacklisted collection', async () => {
            await nftwatchdao.actions
                .addblacklist([COLLECTION_PIXELHEROES, stonebreaker.name, '1337 stuff'])
                .send(`${stonebreaker.name}@active`);
            await expectToThrow(
                nftwatchdao.actions
                    .reqshielding([COLLECTION_PIXELHEROES, requester.name, soonmarket.name, false, ''])
                    .send(`${requester.name}@active`),
                eosio_assert(ERROR_COLLECTION_ALREADY_BLACKLISTED),
            );
            await expectToThrow(
                nftwatchdao.actions.report([COLLECTION_PIXELHEROES, reporter.name, '']).send(`${reporter.name}@active`),
                eosio_assert(ERROR_COLLECTION_ALREADY_BLACKLISTED),
            );
        });
        it('report already reported collection', async () => {
            await nftwatchdao.actions
                .report([COLLECTION_PIXELHEROES, reporter.name, ''])
                .send(`${reporter.name}@active`);
            await expectToThrow(
                nftwatchdao.actions.report([COLLECTION_PIXELHEROES, reporter.name, '']).send(`${reporter.name}@active`),
                eosio_assert(ERROR_COLLECTION_ALREADY_REPORTED),
            );
        });
        it('confirm a not reported collection', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .confirmrep([COLLECTION_PIXELHEROES, stonebreaker.name, ''])
                    .send(`${stonebreaker.name}@active`),
                eosio_assert(ERROR_COLLECTION_NOT_REPORTED),
            );
        });
        it('delete a not blacklisted collection', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .delblacklist([COLLECTION_PIXELHEROES, stonebreaker.name, ''])
                    .send(`${stonebreaker.name}@active`),
                eosio_assert(ERROR_COLLECTION_NOT_BLACKLISTED),
            );
        });
        it('request shield with invalid marketplace', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .reqshielding([COLLECTION_CYPHER_GANG, requester.name, 'digitalgalaxy', false, ''])
                    .send(`${requester.name}@active`),
                eosio_assert(ERROR_INVALID_MARKETPLACE),
            );
        });
        it('request shield with missing balance', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .reqshielding([COLLECTION_CYPHER_GANG, requester.name, soonmarket.name, false, ''])
                    .send(`${requester.name}@active`),
                eosio_assert(ERROR_MISSING_SHIELDING_BALANCE),
            );
        });
        it('request shield with wrong shielding price', async () => {
            await expectToThrow(
                eosioToken.actions
                    .transfer([
                        requester.name,
                        nftwatchdao.name,
                        getTokenAmountActionParam(12400, TOKEN_XPR),
                        'shielding',
                    ])
                    .send(`${requester.name}@active`),
                eosio_assert(ERROR_INVALID_SHIELDING_PRICE),
            );
        });
        it('request shield with insufficient balance', async () => {
            await eosioToken.actions
                .transfer([requester.name, nftwatchdao.name, getTokenAmountActionParam(12500, TOKEN_XPR), 'shielding'])
                .send(`${requester.name}@active`);
            await nftwatchdao.actions
                .reqshielding([COLLECTION_CYPHER_GANG, requester.name, soonmarket.name, false, ''])
                .send(`${requester.name}@active`);
            await expectToThrow(
                nftwatchdao.actions
                    .reqshielding([COLLECTION_PIXELHEROES, requester.name, soonmarket.name, false, ''])
                    .send(`${requester.name}@active`),
                eosio_assert(ERROR_INSUFFICIENT_SHIELDING_BALANCE),
            );
        });
        it('confirm non existing shielding request', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .confshield([COLLECTION_CYPHER_GANG, stonebreaker.name, 'Qm...'])
                    .send(`${stonebreaker.name}@active`),
                eosio_assert(ERROR_SHIELDING_REQUEST_NOT_EXISTS),
            );
        });
        it('confirm / reject shielding with invalid reportCid', async () => {
            await eosioToken.actions
                .transfer([requester.name, nftwatchdao.name, getTokenAmountActionParam(12500, TOKEN_XPR), 'shielding'])
                .send(`${requester.name}@active`);
            await nftwatchdao.actions
                .reqshielding([COLLECTION_CYPHER_GANG, requester.name, soonmarket.name, false, ''])
                .send(`${requester.name}@active`);
            await expectToThrow(
                nftwatchdao.actions
                    .confshield([COLLECTION_CYPHER_GANG, stonebreaker.name, 'invalid reportCid'])
                    .send(`${stonebreaker.name}@active`),
                eosio_assert(ERROR_INVALID_CID),
            );
            await expectToThrow(
                nftwatchdao.actions
                    .rejectshield([COLLECTION_CYPHER_GANG, stonebreaker.name, 'invalid reportCid'])
                    .send(`${stonebreaker.name}@active`),
                eosio_assert(ERROR_INVALID_CID),
            );
        });
        it('delete a not shielded collection', async () => {
            await expectToThrow(
                nftwatchdao.actions
                    .delshielding([COLLECTION_PIXELHEROES, stonebreaker.name, ''])
                    .send(`${stonebreaker.name}@active`),
                eosio_assert(ERROR_COLLECTION_NOT_SHIELDED),
            );
        });
    });
});
