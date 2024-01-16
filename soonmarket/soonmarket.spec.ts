import { expect } from 'chai';
import { Blockchain, expectToThrow, mintTokens, nameToBigInt } from '@proton/vert';
import {
    LOAN,
    METAL,
    XBTC,
    XDOGE,
    XETH,
    XMD,
    XMT,
    XPR,
    XUSDC,
    eosio_assert,
    initContracts,
} from '../helpers/common.ts';
import { NFT, createTestCollection, initialAdminColEdit, transferNfts } from '../helpers/atomicassets.helper.ts';
import { Auction, addTokens, announceAuction, regMarket } from '../helpers/atomicmarket.helper.ts';
import {
    ERROR_AUCTION_NOT_EXISTS,
    ERROR_COLLECTION_NOT_EXISTS,
    ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED,
    ERROR_INVALID_PROMOTION_TYPE,
    ERROR_INVALID_PROMOTION_TYPE_AUCTION_GOLD_ONLY,
    ERROR_INVALID_WORD_COUNT,
    ERROR_AUCTION_NOT_STARTED,
    ERROR_ONLY_ONE_SPOT_NFT_ALLOWED,
    ONE_HOUR,
    ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION,
    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
    ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED,
    ERROR_COLLECTION_NOT_BLACKLISTED,
    CYPHER_GANG,
    PIXELHEROES,
    ERROR_COLLECTION_BLACKLISTED,
    ERROR_COLLECTION_ALREADY_BLACKLISTED,
    ERROR_COLLECTION_NOT_VERIFIED,
    ERROR_COLLECTION_ALREADY_VERIFIED,
    GOLD_SPOT_ID_MAINNET,
    SILVER_SPOT_TEMPLATE_ID_MAINNET,
} from './soonmarket.constants.ts';
import { Globals } from './soonmarket.tables.ts';

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
const [powerofsoon, protonpunk, pixelheroes, marco, mitch] = blockchain.createAccounts(
    'powerofsoon',
    'protonpunk',
    'pixelheroes',
    'marco',
    'mitch',
);

// helpers
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
    await mintTokens(eosioToken, XPR.name, XPR.precision, 10000000.0, 4, [marco, mitch]);
    await mintTokens(xtokens, XBTC.name, XBTC.precision, 21000000.0, 5, [marco, mitch]);
    await mintTokens(xtokens, XETH.name, XETH.precision, 100000000.0, 20, [marco, mitch]);
    await mintTokens(xtokens, XDOGE.name, XDOGE.precision, 128303944202.0, 100000, [marco, mitch]);
    await mintTokens(xtokens, XUSDC.name, XUSDC.precision, 2588268654.84833, 20000, [marco, mitch]);
    await mintTokens(xtokens, XMT.name, XMT.precision, 66588888.0, 5000, [marco, mitch]);
    await mintTokens(xtokens, METAL.name, METAL.precision, 666666666.0, 20000, [marco, mitch]);
    await mintTokens(loanToken, LOAN.name, LOAN.precision, 100000000.0, 20000, [marco, mitch]); // how to define unlimited?
    await mintTokens(xmdToken, XMD.name, XMD.precision, 100000000.0, 20000, [marco, mitch]); // how to define unlimited?
    // atomicmarket
    await regMarket(atomicmarket, soonmarket);
    await addTokens(atomicmarket, eosioToken, [XPR]);
    await addTokens(atomicmarket, xtokens, [XBTC, XETH, XDOGE, XUSDC, XMT, METAL]);
    await addTokens(atomicmarket, loanToken, [LOAN]);
    await addTokens(atomicmarket, xmdToken, [XMD]);
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
        .addverified([CYPHER_GANG, 'testing cool shit here :-)', ['https://cyphergang.com']])
        .send();
    // add blacklisted collection
    await soonmarket.actions.addblacklist([PIXELHEROES, 'testing cool shit here :-)', []]).send();
    const globals = getGlobals();
    console.log(JSON.stringify(globals));
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
                    transferNfts(atomicassets, marco, soonmarket, silverSpots, `collection ${CYPHER_GANG}`),
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
                        transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], `offer ${CYPHER_GANG}`),
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
            xit('reject auction promotion with silver spot (TODO: enable again once we upgrade the code)', async () => {
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
                    transferNfts(atomicassets, pixelheroes, soonmarket, [pixelheroNft], `collection ${CYPHER_GANG}`),
                    eosio_assert(ERROR_INVALID_NFT_SILVER_SPOT_EXPECTED),
                );
            });
            it('reject if collection is blacklisted', async () => {
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${PIXELHEROES}`),
                    eosio_assert(ERROR_COLLECTION_BLACKLISTED),
                );
            });
            it('reject if collection is neither verified nor shielded', async () => {
                await soonmarket.actions.delblacklist([PIXELHEROES]).send();
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [spotNft], `collection ${PIXELHEROES}`),
                    eosio_assert(ERROR_COLLECTION_NEITHER_VERIFIED_NOR_SHIELDED),
                );
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
                    XPR,
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
            it('reject if remaining auction time is too low or expired', async () => {
                const invalidRemainingTime = ONE_HOUR - 1;
                await announceAuction(
                    atomicmarket,
                    protonpunk,
                    [cypherToAuction],
                    1337,
                    XPR,
                    invalidRemainingTime,
                    soonmarket,
                    atomicassets,
                    true,
                );
                const auction: Auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
                await expectToThrow(
                    transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction ${auction.auction_id}`),
                    eosio_assert(ERROR_AUCTION_EXPIRED_OR_CLOSE_TO_EXPIRATION),
                );

                // TODO test for expired auction
            });
            it('expect log actions to fail if called from other account', async () => {
                await expectToThrow(
                    soonmarket.actions.logauctpromo([1, marco.name, 'gold']).send('marco@active'),
                    ERROR_MISSING_REQUIRED_AUTHORITY_SOONMARKET,
                );
                await expectToThrow(
                    soonmarket.actions
                        .logcolpromo(['dogelover', marco.name, 'gold', Math.round(Date.now() / 1000)])
                        .send('marco@active'),
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
                await transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], `collection ${CYPHER_GANG}`);
                // powerofsoon is new owner
                spotNft = atomicassets.tables
                    .assets(nameToBigInt(powerofsoon.name))
                    .getTableRow(silverSpots[0].asset_id);
                expect(spotNft).not.undefined;
                expect(getGlobals().silverPromoCount).equal(1);
            });
            it('promotion of NFT auction via silver spot (TODO: remove once we upgrade the code and disallow this)', async () => {
                // marco is owner, powerofsoon not
                let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
                expect(spotNft).not.undefined;
                spotNft = atomicassets.tables
                    .assets(nameToBigInt(powerofsoon.name))
                    .getTableRow(silverSpots[0].asset_id);
                expect(spotNft).undefined;
                // announce & start auction
                await announceAuction(
                    atomicmarket,
                    protonpunk,
                    [cypherToAuction],
                    1337,
                    XPR,
                    86400,
                    soonmarket,
                    atomicassets,
                    true,
                );
                // get auction
                const auction: Auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
                // promote by transferring gold spot with valid memo to soonmarket
                await transferNfts(atomicassets, marco, soonmarket, [silverSpots[0]], `auction ${auction.auction_id}`),
                    // // powerofsoon is new owner
                    (spotNft = atomicassets.tables
                        .assets(nameToBigInt(powerofsoon.name))
                        .getTableRow(silverSpots[0].asset_id));
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
                    XPR,
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
                await transferNfts(atomicassets, marco, soonmarket, [goldSpot], `collection ${CYPHER_GANG}`);
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
                soonmarket.actions.delblacklist([CYPHER_GANG]).send(),
                eosio_assert(ERROR_COLLECTION_NOT_BLACKLISTED),
            );
        });
        it('reject if collection already blacklisted', async () => {
            await expectToThrow(
                soonmarket.actions.addblacklist([PIXELHEROES, 'reverts anyway, already blacklisted ...', []]).send(),
                eosio_assert(ERROR_COLLECTION_ALREADY_BLACKLISTED),
            );
        });
    });
    describe('verified handling', () => {
        it('reject trying to remove verified collection', async () => {
            await expectToThrow(
                soonmarket.actions.delverified([PIXELHEROES]).send(),
                eosio_assert(ERROR_COLLECTION_NOT_VERIFIED),
            );
        });
        it('reject if collection already verified', async () => {
            await expectToThrow(
                soonmarket.actions.addverified([CYPHER_GANG, 'reverts anyway, already verified ...', []]).send(),
                eosio_assert(ERROR_COLLECTION_ALREADY_VERIFIED),
            );
        });
    });
});
