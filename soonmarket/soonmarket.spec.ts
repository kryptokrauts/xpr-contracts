import { expect } from 'chai';
import { Account, Blockchain, expectToThrow, mintTokens, nameToBigInt, symbolCodeToBigInt } from '@proton/vert';
import { Asset, Name, TimePointSec } from '@greymass/eosio';
import { NFT, createTestCollection, initialAdminColEdit, transferNfts } from '../helpers/atomicassets.helper.ts';
import { Auction, addTokens, announceAuction, regMarket } from '../helpers/atomicmarket.helper.ts';
import {
    COLLECTION_CYPHER_GANG,
    COLLECTION_PIXELHEROES,
    TOKEN_LOAN,
    TOKEN_METAL,
    TOKEN_XBTC,
    TOKEN_XDOGE,
    TOKEN_XETH,
    TOKEN_XMD,
    TOKEN_XMT,
    TOKEN_XPR,
    TOKEN_XUSDC,
    eosio_assert,
} from '../helpers/common.ts';
import {
    ERROR_AUCTION_NOT_EXISTS,
    ERROR_COLLECTION_NOT_EXISTS,
    ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED,
    ERROR_INVALID_PROMOTION_TYPE,
    ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY,
    ERROR_INVALID_WORD_COUNT,
    ERROR_AUCTION_NOT_STARTED,
    ERROR_ONLY_ONE_SPOT_NFT_ALLOWED,
    ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION,
    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
    ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED,
    ERROR_COLLECTION_NOT_BLACKLISTED,
    ERROR_COLLECTION_BLACKLISTED,
    ERROR_COLLECTION_ALREADY_BLACKLISTED,
    ERROR_COLLECTION_NOT_VERIFIED,
    ERROR_COLLECTION_ALREADY_VERIFIED,
    ONE_HOUR,
    ERROR_COLLECTION_ALREADY_PROMOTED,
    ONE_WEEK,
    ONE_DAY,
} from './soonmarket.constants.ts';
import { Globals, SilverSpotPromotions } from './soonmarket.tables.ts';

const blockchain = new Blockchain();

// deploy contract to test
const soonmarket = blockchain.createContract('soonmarket', 'soonmarket/target/soonmarket.contract');

// deploy contracts required for testing
const eosioToken = blockchain.createContract('eosio.token', 'node_modules/proton-tsc/external/eosio.token/eosio.token');
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets');
const atomicmarket = blockchain.createContract('atomicmarket', 'external/atomicmarket/atomicmarket');
const xtokens = blockchain.createContract('xtokens', 'node_modules/proton-tsc/external/xtokens/xtokens');
const xmdToken = blockchain.createContract('xmd.token', 'node_modules/proton-tsc/external/xtokens/xtokens');
// in real world not using xtokens contract, but just simulating with xtokens for testing
const loanToken = blockchain.createContract('loan.token', 'node_modules/proton-tsc/external/xtokens/xtokens');

// create accounts
const [powerofsoon, soonfinance, protonpunk, pixelheroes, marco, mitch] = blockchain.createAccounts(
    'powerofsoon',
    'soonfinance',
    'protonpunk',
    'pixelheroes',
    'marco',
    'mitch',
);

// helpers
const initContracts = async (...contracts: Array<Account>): Promise<void> => {
    for (const contract of contracts) {
        await contract.actions.init().send();
    }
};
const getAccountBalance = (contract: Account, accountName: string, symbol: string) => {
    const accountBigInt = nameToBigInt(Name.from(accountName));
    const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symbol));
    return contract.tables.accounts(accountBigInt).getTableRow(symcodeBigInt);
};
const getGlobals = (): Globals => soonmarket.tables.globals().getTableRows()[0];

let silverSpots: Array<NFT> = [];
let goldSpot: NFT;
let cypherToAuction: NFT;

let initSnapshot: number;

before(async () => {
    blockchain.resetTables();
    await initContracts(atomicassets, atomicmarket);
    await initialAdminColEdit(atomicassets);
    // atomicassets
    await createTestCollection(atomicassets, powerofsoon, marco); // minting all spot NFTs to marco
    await createTestCollection(atomicassets, protonpunk);
    await createTestCollection(atomicassets, pixelheroes);
    // tokens
    await mintTokens(eosioToken, TOKEN_XPR.name, TOKEN_XPR.precision, 100_000_000.0, 10_000_000, [
        marco,
        mitch,
        soonmarket,
    ]);
    await mintTokens(xtokens, TOKEN_XBTC.name, TOKEN_XBTC.precision, 21_000_000.0, 5, [marco, mitch]);
    await mintTokens(xtokens, TOKEN_XETH.name, TOKEN_XETH.precision, 100_000_000.0, 20, [marco, mitch]);
    await mintTokens(xtokens, TOKEN_XDOGE.name, TOKEN_XDOGE.precision, 128_303_944_202.0, 100_000, [marco, mitch]);
    await mintTokens(xtokens, TOKEN_XUSDC.name, TOKEN_XUSDC.precision, 2_588_268_654.84833, 20_000, [marco, mitch]);
    await mintTokens(xtokens, TOKEN_XMT.name, TOKEN_XMT.precision, 66_588_888.0, 5_000, [marco, mitch]);
    await mintTokens(xtokens, TOKEN_METAL.name, TOKEN_METAL.precision, 666_666_666.0, 20_000, [marco, mitch]);
    await mintTokens(loanToken, TOKEN_LOAN.name, TOKEN_LOAN.precision, 100_000_000.0, 20_000, [marco, mitch]); // how to define unlimited?
    await mintTokens(xmdToken, TOKEN_XMD.name, TOKEN_XMD.precision, 100_000_000.0, 20_000, [marco, mitch]); // how to define unlimited?
    // atomicmarket
    await regMarket(atomicmarket, soonmarket);
    await addTokens(atomicmarket, eosioToken, [TOKEN_XPR]);
    await addTokens(atomicmarket, xtokens, [TOKEN_XBTC, TOKEN_XETH, TOKEN_XDOGE, TOKEN_XUSDC, TOKEN_XMT, TOKEN_METAL]);
    await addTokens(atomicmarket, loanToken, [TOKEN_LOAN]);
    await addTokens(atomicmarket, xmdToken, [TOKEN_XMD]);
    // get spot nft id (no need to check collection because marco owns only spot nfts)
    const spotNfts: Array<NFT> = atomicassets.tables
        .assets(nameToBigInt(marco.name))
        .getTableRows(undefined, { limit: 4 });
    goldSpot = spotNfts[0];
    silverSpots.push(spotNfts[1], spotNfts[2], spotNfts[3]);
    // get cypher nft to auction
    cypherToAuction = atomicassets.tables
        .assets(nameToBigInt(protonpunk.name))
        .getTableRows(undefined, { limit: 1 })[0];
    // set correct spot ids for tests
    await soonmarket.actions.setspots([Number.parseInt(goldSpot.asset_id), silverSpots[0].template_id]).send();
    // add verified collection
    await soonmarket.actions
        .addverified([COLLECTION_CYPHER_GANG, 'testing cool shit here :-)', ['https://cyphergang.com']])
        .send();
    // add blacklisted collection
    await soonmarket.actions.addblacklist([COLLECTION_PIXELHEROES, 'testing cool shit here :-)', []]).send();
    const globals = getGlobals();
    expect(globals.goldSpotId).equal(goldSpot.asset_id);
    expect(globals.silverSpotTemplateId).equal(silverSpots[0].template_id);
    expect(globals.verifiedCount).equal(1);
    expect(globals.blacklistCount).equal(1);
    initSnapshot = blockchain.store.snapshot();
});

beforeEach(async () => {
    blockchain.store.revertTo(initSnapshot);
});

describe('SoonMarket', () => {
    describe('spot handling', () => {
        describe('revert paths', () => {
            it('reject with transfer of more than 1 spot nft', async () => {
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, silverSpots, `collection ${COLLECTION_CYPHER_GANG}`),
                    eosio_assert(ERROR_ONLY_ONE_SPOT_NFT_ALLOWED),
                );
            });
            describe('reject with invalid memos', () => {
                it('empty memo', async () => {
                    await expectToThrow(
                        transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], ''),
                        eosio_assert(ERROR_INVALID_WORD_COUNT),
                    );
                });
                it('1 word only', async () => {
                    await expectToThrow(
                        transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], 'collection'),
                        eosio_assert(ERROR_INVALID_WORD_COUNT),
                    );
                });
                it('invalid promotion type', async () => {
                    await expectToThrow(
                        transferNfts(
                            atomicassets,
                            marco,
                            soonmarket,
                            [silverSpots[0]],
                            `offer ${COLLECTION_CYPHER_GANG}`,
                        ),
                        eosio_assert(ERROR_INVALID_PROMOTION_TYPE),
                    );
                });
            });
            it('reject with non existing collection', async () => {
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], 'collection colnotexists'),
                    eosio_assert(ERROR_COLLECTION_NOT_EXISTS),
                );
            });
            it('reject auction promotion with silver spot', async () => {
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], 'auction 1337'),
                    eosio_assert(ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY),
                );
            });
            it('reject if templateId not a silver spot', async () => {
                const pixelheroNft: NFT = atomicassets.tables
                    .assets(nameToBigInt(pixelheroes.name))
                    .getTableRow('1099511627807');
                expect(
                    silverSpots[0].template_id == pixelheroNft.template_id,
                    'wrong template id for the test, needs to be the same as silver spot',
                );
                await expectToThrow(
                    transferNfts(
                        atomicassets,
                        pixelheroes,
                        soonmarket,
                        [pixelheroNft],
                        `collection ${COLLECTION_CYPHER_GANG}`,
                    ),
                    eosio_assert(ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED),
                );
            });
            it('reject if collection is blacklisted', async () => {
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${COLLECTION_PIXELHEROES}`),
                    eosio_assert(ERROR_COLLECTION_BLACKLISTED),
                );
            });
            it('reject if collection is neither verified nor shielded', async () => {
                await soonmarket.actions.delblacklist([COLLECTION_PIXELHEROES]).send();
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${COLLECTION_PIXELHEROES}`),
                    eosio_assert(ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED),
                );
            });
            it('reject if collection is already promoted', async () => {
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                // valid promotion
                await transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${COLLECTION_CYPHER_GANG}`);
                // promotion still running
                spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[1].asset_id);
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${COLLECTION_CYPHER_GANG}`),
                    eosio_assert(ERROR_COLLECTION_ALREADY_PROMOTED),
                );
                // let promotion expire
                blockchain.addTime(TimePointSec.fromInteger(ONE_WEEK + 1));
                // allow again once promotion ended
                await transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${COLLECTION_CYPHER_GANG}`);
                const promoEntry: SilverSpotPromotions = soonmarket.tables
                    .silverpromos()
                    .getTableRow(nameToBigInt(COLLECTION_CYPHER_GANG));
                expect(promoEntry.promoCount).equal(2);
                expect(promoEntry.lastPromoEnd).equal(blockchain.timestamp.toMilliseconds() / 1000 + ONE_WEEK);
            });
            it('reject if auction not exists', async () => {
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction 1337`),
                    eosio_assert(ERROR_AUCTION_NOT_EXISTS),
                );
            });
            it('reject if auction is not started yet', async () => {
                // do not transfer nfts so that auction does not start
                await announceAuction(
                    atomicmarket,
                    protonpunk,
                    [cypherToAuction],
                    1337,
                    TOKEN_XPR,
                    86400,
                    soonmarket,
                    atomicassets,
                    false,
                );
                const auction: Auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction ${auction.auction_id}`),
                    eosio_assert(ERROR_AUCTION_NOT_STARTED),
                );
            });
            it('reject if remaining auction time is too low', async () => {
                await announceAuction(
                    atomicmarket,
                    protonpunk,
                    [cypherToAuction],
                    1337,
                    TOKEN_XPR,
                    ONE_HOUR - 1, // invalid, must be >= ONE_HOUR
                    soonmarket,
                    atomicassets,
                    true,
                );
                const auction: Auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction ${auction.auction_id}`),
                    eosio_assert(ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION),
                );
            });
            it('reject if remaining auction is expired', async () => {
                await announceAuction(
                    atomicmarket,
                    protonpunk,
                    [cypherToAuction],
                    1337,
                    TOKEN_XPR,
                    ONE_HOUR,
                    soonmarket,
                    atomicassets,
                    true,
                );
                const auction: Auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
                // let auction expire
                blockchain.addTime(TimePointSec.fromInteger(ONE_HOUR + 1));
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction ${auction.auction_id}`),
                    eosio_assert(ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION),
                );
            });
            it('expect actions to fail with missing authority', async () => {
                const sender = `${marco.name}@active`;
                await expectToThrow(
                    soonmarket.actions.setspots([1, 1]).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions.setpromodur([ONE_DAY, ONE_HOUR]).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions.addblacklist([COLLECTION_PIXELHEROES, 'fails anyway', []]).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions.delblacklist([COLLECTION_PIXELHEROES]).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions.addverified([COLLECTION_CYPHER_GANG, 'fails anyway', []]).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions.delverified([COLLECTION_CYPHER_GANG]).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions.logauctpromo([1, marco.name, 'gold']).send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions
                        .logcolpromo(['dogelover', marco.name, 'gold', Math.round(Date.now() / 1000)])
                        .send(sender),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
            });
        });
        describe('happy paths', () => {
            it('promotion of collection via silver spot', async () => {
                // marco is owner, powerofsoon not
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                expect(spotNft).not.undefined;
                spotNft = atomicassets.tables
                    .assets(nameToBigInt(powerofsoon.name))
                    .getTableRow(silverSpots[0].asset_id);
                expect(spotNft).undefined;
                // promote by transferring Spot NFT with valid memo to soonmarket
                await transferNfts(
                    atomicassets,
                    marco,
                    soonmarket,
                    [silverSpots[0]],
                    `collection ${COLLECTION_CYPHER_GANG}`,
                );
                // powerofsoon is new owner
                spotNft = atomicassets.tables
                    .assets(nameToBigInt(powerofsoon.name))
                    .getTableRow(silverSpots[0].asset_id);
                expect(spotNft).not.undefined;
                expect(getGlobals().silverPromoCount).equal(1);
            });
            it('promotion of NFT auction via gold spot', async () => {
                // marco is owner, powerofsoon not
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(goldSpot.asset_id);
                expect(spotNft).not.undefined;
                spotNft = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(goldSpot.asset_id);
                expect(spotNft).undefined;
                // announce & start auction
                await announceAuction(
                    atomicmarket,
                    protonpunk,
                    [cypherToAuction],
                    1337,
                    TOKEN_XPR,
                    86400,
                    soonmarket,
                    atomicassets,
                    true,
                );
                // get auction
                const auction: Auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
                // promote by transferring gold spot with valid memo to soonmarket
                await transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction ${auction.auction_id}`),
                    // powerofsoon is new owner
                    (spotNft = atomicassets.tables
                        .assets(nameToBigInt(powerofsoon.name))
                        .getTableRow(goldSpot.asset_id));
                expect(spotNft).not.undefined;
                expect(getGlobals().goldPromoCount).equal(1);
            });
            it('promotion of NFT collection via gold spot', async () => {
                // marco is owner, powerofsoon not
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(goldSpot.asset_id);
                expect(spotNft).not.undefined;
                spotNft = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(goldSpot.asset_id);
                expect(spotNft).undefined;
                // promote by transferring Spot NFT with valid memo to soonmarket
                await transferNfts(atomicassets, marco, soonmarket, [goldSpot], `collection ${COLLECTION_CYPHER_GANG}`);
                // powerofsoon is new owner
                spotNft = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(goldSpot.asset_id);
                expect(spotNft).not.undefined;
                expect(getGlobals().goldPromoCount).equal(1);
            });
        });
    });
    describe('blacklist handling', () => {
        it('reject trying to remove non-blacklisted collection', async () => {
            await expectToThrow(
                soonmarket.actions.delblacklist([COLLECTION_CYPHER_GANG]).send(),
                eosio_assert(ERROR_COLLECTION_NOT_BLACKLISTED),
            );
        });
        it('reject if collection already blacklisted', async () => {
            await expectToThrow(
                soonmarket.actions
                    .addblacklist([COLLECTION_PIXELHEROES, 'reverts anyway, already blacklisted ...', []])
                    .send(),
                eosio_assert(ERROR_COLLECTION_ALREADY_BLACKLISTED),
            );
        });
    });
    describe('verified handling', () => {
        it('reject trying to remove verified collection', async () => {
            await expectToThrow(
                soonmarket.actions.delverified([COLLECTION_PIXELHEROES]).send(),
                eosio_assert(ERROR_COLLECTION_NOT_VERIFIED),
            );
        });
        it('reject if collection already verified', async () => {
            await expectToThrow(
                soonmarket.actions
                    .addverified([COLLECTION_CYPHER_GANG, 'reverts anyway, already verified ...', []])
                    .send(),
                eosio_assert(ERROR_COLLECTION_ALREADY_VERIFIED),
            );
        });
    });
    describe('forward marketplace revenue handling', () => {
        it('do not forward incoming token transfer from marco', async () => {
            const amount = '1337.0000 XPR';
            await eosioToken.actions
                .transfer(['marco', 'soonmarket', `${amount}`, `no forwarding`])
                .send('marco@active');
            const marco = getAccountBalance(eosioToken, 'marco', 'XPR');
            expect('9998663.0000 XPR').equal(marco.balance);
            const soonmarketAcc = getAccountBalance(eosioToken, 'soonmarket', 'XPR');
            expect('10001337.0000 XPR').equal(soonmarketAcc.balance);
            const soonfinanceAcc = getAccountBalance(eosioToken, 'soonfinance', 'XPR');
            expect(soonfinanceAcc).undefined;
        });
        it('forward token transfer from atomicmarket', async () => {
            const amount = `1337.0000 XPR`;
            // deposit to atomicmarket
            await eosioToken.actions
                .transfer(['soonmarket', 'atomicmarket', `${amount}`, `deposit`])
                .send('soonmarket@active');
            let soonmarketAcc = getAccountBalance(eosioToken, 'soonmarket', 'XPR');
            expect('9998663.0000 XPR').equal(soonmarketAcc.balance);
            let atomicmarketAcc = getAccountBalance(eosioToken, 'atomicmarket', 'XPR');
            expect(amount).equal(atomicmarketAcc.balance);
            await atomicmarket.actions.withdraw(['soonmarket', amount]).send('soonmarket@active');
            soonmarketAcc = getAccountBalance(eosioToken, 'soonmarket', 'XPR');
            expect('9998663.0000 XPR').equal(soonmarketAcc.balance);
            atomicmarketAcc = getAccountBalance(eosioToken, 'atomicmarket', 'XPR');
            expect('0.0000 XPR').equal(atomicmarketAcc.balance);
            const soonfinanceAcc = getAccountBalance(eosioToken, 'soonfinance', 'XPR');
            expect(amount).equal(soonfinanceAcc.balance);
        });
    });
});
