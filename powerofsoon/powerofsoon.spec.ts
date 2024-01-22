import { expect } from 'chai';
import { Account, AccountPermission, Blockchain, PermissionLevelWeight, generatePermissions, mintTokens, nameToBigInt, symbolCodeToBigInt } from '@proton/vert';
import { Asset, Name } from '@greymass/eosio';
import { COLLECTION_CYPHER_GANG, COLLECTION_PIXELHEROES, TOKEN_XPR, TOKEN_XUSDC } from '../helpers/common.ts';
import { NFT, createTestCollection, initialAdminColEdit, transferNfts } from '../helpers/atomicassets.helper.ts';
import { addTokens, regMarket } from '../helpers/atomicmarket.helper.ts';
import { ORACLES_FEED_INDEX_XPRUSD, ORACLES_FEED_NAME_XPRUSD } from './powerofsoon.constants.ts';
import { Globals } from './powerofsoon.tables';
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
export const initContracts = async (...contracts: Array<Account>): Promise<void> => {
    for (const contract of contracts) {
        await contract.actions.init().send();
    }
};
const getAccountBalance = (contract: Account, accountName: string, symbol: string) => {
    const accountBigInt = nameToBigInt(Name.from(accountName));
    const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symbol));
    return contract.tables.accounts(accountBigInt).getTableRow(symcodeBigInt);
};
const getGlobals = (): Globals => powerofsoon.tables.globals().getTableRows()[0];
const getSoonMarketGlobals = (): SoonMarketGlobals => soonmarket.tables.globals().getTableRows()[0];

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
        .addverified([COLLECTION_CYPHER_GANG, 'testing cool shit here :-)', ['https://cyphergang.com']])
        .send();
    // add blacklisted collection
    await soonmarket.actions.addblacklist([COLLECTION_PIXELHEROES, 'testing cool shit here :-)', []]).send();
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
    await oracles.actions.feed(['oracles', ORACLES_FEED_INDEX_XPRUSD, { d_double: 0.0007857865 }]).send();
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
            // TODO check new SPOT mint
            // TODO check auction
        });
        it('gold spot logic (re-auction)', async () => {
            // TODO
        });
    });
    describe('primary spot issuance', () => {
        it('mint free spot', async () => {
            // TODO
        });
        it('mint and auction spot', async () => {
            // TODO
        });
    });
    describe('auction handling', () => {
        it('claim auction income', async () => {
            // TODO
        });
        it('cancel auction', async () => {
            // TODO
        });
    });
});
