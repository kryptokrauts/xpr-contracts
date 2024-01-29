import { expect } from 'chai';
import {
    Account,
    Blockchain,
    bnToBigInt,
    expectToThrow,
    mintTokens,
    nameToBigInt,
    symbolCodeToBigInt,
} from '@proton/vert';
import { Asset, Name, TimePointSec } from '@greymass/eosio';
import { Assets, Config } from 'proton-tsc/atomicassets';
import {
    COLLECTION_CYPHER_GANG,
    COLLECTION_PIXELHEROES,
    TOKEN_XPR,
    TOKEN_XUSDC,
    eosio_assert,
} from '../helpers/common.ts';
import { NFT, createTestCollection, initialAdminColEdit, transferNfts } from '../helpers/atomicassets.helper.ts';
import {
    Auction,
    ERROR_AUCTION_NOT_FINISHED,
    addTokens,
    announceAuction,
    auctionBid,
    regMarket,
} from '../helpers/atomicmarket.helper.ts';
import {
    ERROR_AUCTION_HAS_BIDS,
    ERROR_AUCTION_NOT_EXISTS,
    ERROR_AUCTION_STILL_RUNNING,
    ERROR_INVALID_AUCTION_SELLER,
    ERROR_INVALID_REAUCT_DURATION,
    ERROR_INVALID_START_PRICE,
    ERROR_MARKET_BALANCE_NOT_FOUND,
    ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON,
    ONE_DAY,
    ONE_HOUR,
    ONE_WEEK,
    ORACLES_FEED_INDEX_XPRUSD,
    ORACLES_FEED_NAME_XPRUSD,
    SILVER_AUCTION_START_PRICE_USD,
    TWO_WEEKS,
} from './powerofsoon.constants.ts';
import { Globals as SoonMarketGlobals } from '../soonmarket/soonmarket.tables';

const blockchain = new Blockchain();

// deploy contract to test
const powerofsoon = blockchain.createContract('powerofsoon', 'powerofsoon/target/powerofsoon.contract');
const soonmarket = blockchain.createContract('soonmarket', 'soonmarket/target/soonmarket.contract');

// deploy contracts required for testing
const eosioToken = blockchain.createContract('eosio.token', 'node_modules/proton-tsc/external/eosio.token/eosio.token');
const atomicassets = blockchain.createContract('atomicassets', 'external/atomicassets/atomicassets');
const atomicmarket = blockchain.createContract('atomicmarket', 'external/atomicmarket/atomicmarket');
const xtokens = blockchain.createContract('xtokens', 'node_modules/proton-tsc/external/xtokens/xtokens');
const oracles = blockchain.createContract('oracles', 'node_modules/proton-tsc/external/oracles/oracles');

// create accounts
const [soonfinance, protonpunk, pixelheroes, marco, mitch] = blockchain.createAccounts(
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
const mintFreeSpot = async (recipient: Account, memo: string) => {
    await powerofsoon.actions.mintfreespot([recipient.name.toString(), memo]).send();
};
const mintAuctSpot = async (duration: u32) => {
    await powerofsoon.actions.mintauctspot([duration]).send();
};
const claimAuctInc = async (actor: Account, auctionId: u64) => {
    await powerofsoon.actions.claimauctinc([auctionId]).send(`${actor.name.toString()}@active`);
};
const getAccountBalance = (contract: Account, accountName: string, symbol: string) => {
    const accountBigInt = nameToBigInt(Name.from(accountName));
    const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symbol));
    return contract.tables.accounts(accountBigInt).getTableRow(symcodeBigInt);
};
const getAaConfig = (): Config => atomicassets.tables.config().getTableRows()[0];
const getSoonMarketGlobals = (): SoonMarketGlobals => soonmarket.tables.globals().getTableRows()[0];

let silverSpots: Array<NFT> = [];
let goldSpot: NFT;
let cypherToAuction: NFT;

const XPR_USD_PRICE = 0.0007857865;

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
    await mintTokens(eosioToken, TOKEN_XPR.name, TOKEN_XPR.precision, 100_000_000.0, 10_000_000, [marco, mitch]);
    await mintTokens(xtokens, TOKEN_XUSDC.name, TOKEN_XUSDC.precision, 2_588_268_654.84833, 20_000, [marco, mitch]);

    // atomicmarket
    await regMarket(atomicmarket, soonmarket);
    await addTokens(atomicmarket, eosioToken, [TOKEN_XPR]);
    await addTokens(atomicmarket, xtokens, [TOKEN_XUSDC]);
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
        .addverified([COLLECTION_CYPHER_GANG, 'testing cool shit here :-)'])
        .send();
    // add blacklisted collection
    await soonmarket.actions.addblacklist([COLLECTION_PIXELHEROES, 'testing cool shit here :-)']).send();
    const soonmarketGlobals = getSoonMarketGlobals();
    expect(soonmarketGlobals.goldSpotId).equal(goldSpot.asset_id);
    expect(soonmarketGlobals.silverSpotTemplateId).equal(silverSpots[0].template_id);
    expect(soonmarketGlobals.verifiedCount).equal(1);
    expect(soonmarketGlobals.blacklistCount).equal(1);
    // set up xprUsd feed
    await oracles.actions
        .setfeed([
            'oracles',
            ORACLES_FEED_INDEX_XPRUSD,
            ORACLES_FEED_NAME_XPRUSD,
            '',
            'mean_median',
            'double',
            [
                { key: 'data_same_provider_limit', value: 10 },
                { key: 'data_window_size', value: 210 },
                { key: 'min_provider_wait_sec', value: 0 },
            ],
            ['oracles'],
        ])
        .send();
    // feed
    await oracles.actions.feed(['oracles', ORACLES_FEED_INDEX_XPRUSD, { d_double: XPR_USD_PRICE }]).send();
    initSnapshot = blockchain.store.snapshot();
});

beforeEach(async () => {
    blockchain.store.revertTo(initSnapshot);
});

describe('PowerOfSoon', () => {
    describe('core spot handling', () => {
        it('silver spot (burn, mint, auction)', async () => {
            let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(silverSpots[0].asset_id);
            expect(spotNft).not.undefined;
            // promote by transferring Spot NFT with valid memo to soonmarket
            await transferNfts(
                atomicassets,
                marco,
                soonmarket,
                [silverSpots[0]],
                `collection ${COLLECTION_CYPHER_GANG}`,
            );
            // soonmarket will transfer NFT to powerofsoon and shouldn't own the NFT
            spotNft = atomicassets.tables.assets(nameToBigInt(soonmarket.name)).getTableRow(silverSpots[0].asset_id);
            expect(spotNft).undefined;
            // powerofsoon will burn it, so it doesn't own it anymore
            spotNft = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(silverSpots[0].asset_id);
            expect(spotNft).undefined;
            const auction = atomicmarket.tables.auctions().getTableRows(undefined, { limit: 1 })[0];
            // starting at 0, the end_time must equal the duration of the auction
            expect(auction.end_time).equal(ONE_WEEK);
            const expectedStartingPrice = Math.round((SILVER_AUCTION_START_PRICE_USD * 10000) / XPR_USD_PRICE);
            expect(auction.current_bid).equal(Asset.fromUnits(expectedStartingPrice, '4,XPR').toString());
        });
        it('gold spot logic promoting collection (re-auction)', async () => {
            // marco is owner, powerofsoon not
            let spotNft = atomicassets.tables.assets(nameToBigInt(marco.name)).getTableRow(goldSpot.asset_id);
            expect(spotNft).not.undefined;
            spotNft = atomicassets.tables.assets(nameToBigInt(powerofsoon.name)).getTableRow(goldSpot.asset_id);
            expect(spotNft).undefined;
            // promote by transferring Spot NFT with valid memo to soonmarket
            await transferNfts(atomicassets, marco, soonmarket, [goldSpot], `collection ${COLLECTION_CYPHER_GANG}`);
            // atomicmarket is new owner because the gold spot will immediately be re-auctioned
            spotNft = atomicassets.tables.assets(nameToBigInt(atomicmarket.name)).getTableRow(goldSpot.asset_id);
            expect(spotNft).not.undefined;
            // get gold spot auction
            const auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(1));
            expect(auction.asset_ids[0]).equal(goldSpot.asset_id);
            // expect the gold spot auction to end after two weeks + delay of one day
            expect(auction.end_time).equal(TWO_WEEKS + ONE_DAY);
        });
        it('gold spot logic promoting auction (re-auction)', async () => {
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
                1_337,
                TOKEN_XPR,
                ONE_DAY,
                soonmarket,
                atomicassets,
                true,
            );
            // get auction
            let auction: Auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(1));
            const promotedAuctionEnd = auction.end_time;
            // promote by transferring gold spot with valid memo to soonmarket
            await transferNfts(atomicassets, marco, soonmarket, [goldSpot], `auction ${auction.auction_id}`);
            // atomicmarket is new owner because the gold spot will immediately be re-auctioned
            spotNft = atomicassets.tables.assets(nameToBigInt(atomicmarket.name)).getTableRow(goldSpot.asset_id);
            expect(spotNft).not.undefined;
            // get gold spot auction
            auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(2));
            expect(auction.asset_ids[0]).equal(goldSpot.asset_id);
            // expect the gold spot auction to end one day after the promoted auction ends
            expect(auction.end_time).equal(promotedAuctionEnd + ONE_DAY);
        });
    });
    describe('primary spot issuance', () => {
        it('mint free spot', async () => {
            let mitchNfts: Array<Assets> = atomicassets.tables.assets(nameToBigInt(mitch.name)).getTableRows();
            expect(mitchNfts).empty;
            const expectedAssetId = getAaConfig().asset_counter;
            await mintFreeSpot(mitch, 'free spot for mitch ;-)');
            mitchNfts = atomicassets.tables.assets(nameToBigInt(mitch.name)).getTableRows();
            expect(mitchNfts).not.empty;
            const spotNft: Assets = atomicassets.tables.assets(nameToBigInt(mitch.name)).getTableRow(expectedAssetId);
            expect(spotNft.template_id).equal(getSoonMarketGlobals().silverSpotTemplateId);
        });
        it('mint and auction spot', async () => {
            let marketNfts: Array<Assets> = atomicassets.tables.assets(nameToBigInt(atomicmarket.name)).getTableRows();
            expect(marketNfts).empty;
            const auctions: Array<Auction> = atomicmarket.tables.auctions().getTableRows();
            expect(auctions).empty;
            const expectedAssetId = getAaConfig().asset_counter;
            await mintAuctSpot(ONE_HOUR);
            marketNfts = atomicassets.tables.assets(nameToBigInt(atomicmarket.name)).getTableRows();
            expect(marketNfts).not.empty;
            const spotNft: Assets = atomicassets.tables
                .assets(nameToBigInt(atomicmarket.name))
                .getTableRow(expectedAssetId);
            expect(spotNft.template_id).equal(getSoonMarketGlobals().silverSpotTemplateId);
            const auction: Auction = atomicmarket.tables.auctions().getTableRows()[0];
            expect(auction.asset_ids[0]).equal(expectedAssetId);
            expect(auction.end_time).equal(ONE_HOUR);
        });
    });
    describe('auction handling', () => {
        it('claim auction income', async () => {
            await mintAuctSpot(ONE_HOUR);
            // get auction
            let auction: Auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(1));
            const bidAmount = SILVER_AUCTION_START_PRICE_USD / XPR_USD_PRICE;
            await auctionBid(atomicmarket, mitch, auction.auction_id, bidAmount, TOKEN_XPR, eosioToken, soonmarket);
            auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(auction.auction_id));
            await expectToThrow(claimAuctInc(marco, auction.auction_id), eosio_assert(ERROR_AUCTION_NOT_FINISHED));
            blockchain.addTime(TimePointSec.fromInteger(ONE_HOUR + 1));
            let atomicmarketBalance = getAccountBalance(eosioToken, 'atomicmarket', 'XPR');
            let powerofsoonBalance = getAccountBalance(eosioToken, 'powerofsoon', 'XPR');
            let soonmarketBalance = getAccountBalance(eosioToken, 'powerofsoon', 'XPR');
            let soonfinanceBalance = getAccountBalance(eosioToken, 'soonfinance', 'XPR');
            expect(atomicmarketBalance.balance).equal(`${bidAmount.toFixed(4)} XPR`);
            expect(powerofsoonBalance).undefined;
            expect(soonmarketBalance).undefined;
            expect(soonfinanceBalance).undefined;
            // marco is allowed to execute the action, anybody is
            await claimAuctInc(marco, auction.auction_id);
            // soonmarket will get 2% and powerofsoon will get 83% + 15% = 98% of the income
            // powerofsoon will automatically forward the earnings to soonfinance
            atomicmarketBalance = getAccountBalance(eosioToken, 'atomicmarket', 'XPR');
            powerofsoonBalance = getAccountBalance(eosioToken, 'powerofsoon', 'XPR');
            soonmarketBalance = getAccountBalance(eosioToken, 'soonmarket', 'XPR');
            soonfinanceBalance = getAccountBalance(eosioToken, 'soonfinance', 'XPR');
            // balance now initialized, but zero because it's forwarded
            expect(powerofsoonBalance.balance).equal('0.0000 XPR');
            const floatBid = Number.parseFloat(auction.current_bid.split(' ')[0].replace('.', ''));
            const xprAssetSymbol = Asset.Symbol.from('4,XPR');
            const powerofsoonIncome = Asset.fromFloat(((floatBid / 100) * 98) / 10000, xprAssetSymbol);
            expect(soonfinanceBalance.balance).equal(powerofsoonIncome.toString());
            // remains on atomicmarket for now
            const soonmarketIncome = Asset.fromFloat(((floatBid / 100) * 2) / 10000, xprAssetSymbol);
            expect(atomicmarketBalance.balance).equal(soonmarketIncome.toString());
            // still undefined because unclaimed
            expect(soonmarketBalance).undefined;
            // marco is allowed to execute the action, anybody is
            await soonmarket.actions.clmktbalance([]).send(`${marco.name.toString()}@active`);
            atomicmarketBalance = getAccountBalance(eosioToken, 'atomicmarket', 'XPR');
            soonmarketBalance = getAccountBalance(eosioToken, 'soonmarket', 'XPR');
            soonfinanceBalance = getAccountBalance(eosioToken, 'soonfinance', 'XPR');
            expect(atomicmarketBalance.balance).equal('0.0000 XPR');
            expect(soonmarketBalance.balance).equal('0.0000 XPR');
            expect(soonfinanceBalance.balance).equal(`${bidAmount.toFixed(4)} XPR`);
        });
        it('cancel auction with automated re-auctioning', async () => {
            await mintAuctSpot(ONE_HOUR);
            blockchain.addTime(TimePointSec.fromInteger(ONE_HOUR + 1));
            const auction: Auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(1));
            // marco is allowed to execute the action, anybody is
            await powerofsoon.actions.cancelauct([auction.auction_id]).send(`${marco.name.toString()}@active`);
            // expect a new auction running with default duration
            const newAuction: Auction = atomicmarket.tables.auctions().getTableRow(bnToBigInt(2));
            expect(newAuction.end_time).equal(blockchain.timestamp.toMilliseconds() / 1000 + ONE_WEEK);
        });
    });
    describe('revert paths', () => {
        it('reject setting start price with 0', async () => {
            await expectToThrow(
                powerofsoon.actions.setstartpric([0, 1]).send(),
                eosio_assert(ERROR_INVALID_START_PRICE),
            );
            await expectToThrow(
                powerofsoon.actions.setstartpric([1, 0]).send(),
                eosio_assert(ERROR_INVALID_START_PRICE),
            );
        });
        it('reject setting re-auction duration < one day', async () => {
            await expectToThrow(
                powerofsoon.actions.setreauctdur([ONE_DAY - 1]).send(),
                eosio_assert(ERROR_INVALID_REAUCT_DURATION),
            );
        });
        it('reject claiming non existing market balance', async () => {
            await expectToThrow(
                powerofsoon.actions.clmktbalance().send(),
                eosio_assert(ERROR_MARKET_BALANCE_NOT_FOUND),
            );
        });
        it('reject cancel of auction', async () => {
            await expectToThrow(powerofsoon.actions.cancelauct([1]).send(), eosio_assert(ERROR_AUCTION_NOT_EXISTS));
            await announceAuction(
                atomicmarket,
                marco,
                [silverSpots[0]],
                100,
                TOKEN_XPR,
                ONE_HOUR,
                soonmarket,
                atomicassets,
                true,
            );
            blockchain.addTime(TimePointSec.fromInteger(ONE_HOUR + 1));
            await expectToThrow(powerofsoon.actions.cancelauct([1]).send(), eosio_assert(ERROR_INVALID_AUCTION_SELLER));
            await powerofsoon.actions.mintauctspot([ONE_HOUR]).send();
            await expectToThrow(powerofsoon.actions.cancelauct([2]).send(), eosio_assert(ERROR_AUCTION_STILL_RUNNING));
            const bidAmount = SILVER_AUCTION_START_PRICE_USD / XPR_USD_PRICE;
            await auctionBid(atomicmarket, mitch, 2, bidAmount, TOKEN_XPR, eosioToken, soonmarket);
            blockchain.addTime(TimePointSec.fromInteger(ONE_HOUR + 1));
            await expectToThrow(powerofsoon.actions.cancelauct([2]).send(), eosio_assert(ERROR_AUCTION_HAS_BIDS));
        });
        it('reject with missing authority', async () => {
            const sender = `${marco.name}@active`;
            await expectToThrow(
                powerofsoon.actions.setstartpric([1, 1]).send(sender),
                ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON,
            );
            await expectToThrow(
                powerofsoon.actions.setreauctdur([TWO_WEEKS]).send(sender),
                ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON,
            );
            await expectToThrow(
                powerofsoon.actions.mintfreespot([marco.name, 'should fail']).send(sender),
                ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON,
            );
            await expectToThrow(
                powerofsoon.actions.mintauctspot([ONE_HOUR]).send(sender),
                ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON,
            );
            await expectToThrow(
                powerofsoon.actions.auctlatest([ONE_HOUR]).send(sender),
                ERROR_MISSING_REQUIRED_AUTHORITY_POWEROFSOON,
            );
        });
    });
});
