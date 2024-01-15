import { Account } from '@proton/vert';
import { TokenSymbol, getTokenAmountActionParam } from './common.ts';
import { NFT, transferNfts } from './atomicassets.helper.ts';

export interface Auction {
  auction_id: number;
  seller: string;
  asset_ids: Array<string>;
  end_time: number;
  assets_transferred: boolean;
  current_bid: string;
  current_bidder: string;
  claimed_by_seller: boolean;
  claimed_by_buyer: boolean;
  maker_marketplace: string;
  taker_marketplace: string;
  collection_name: string;
  collection_fee: string;
}

export const addTokens = async (
  atomicmarket: Account,
  tokenContract: Account,
  tokenSymbols: Array<TokenSymbol>,
) => {
  for (let i = 0; i < tokenSymbols.length; i++) {
    await atomicmarket.actions
      .addconftoken([
        tokenContract.name,
        `${tokenSymbols[i].precision},${tokenSymbols[i].name}`,
      ])
      .send();
  }
};

export const regMarket = async (
  atomicmarket: Account,
  creator: Account,
  marketplaceName?: string,
) => {
  const creatorName = creator.name.toString();
  await atomicmarket.actions
    .regmarket([creator.name, marketplaceName ? marketplaceName : creatorName])
    .send(`${creatorName}@active`);
};

export const announceAuction = async (
  atomicmarket: Account,
  seller: Account,
  nfts: Array<NFT>,
  startingPrice: number,
  token: TokenSymbol,
  duration: number,
  makerMarketplace: Account,
  atomicassets?: Account,
  transfer?: boolean,
) => {
  await atomicmarket.actions
    .announceauct([
      seller.name,
      nfts.map((a) => Number.parseInt(a.asset_id!)),
      getTokenAmountActionParam(startingPrice, token),
      duration,
      makerMarketplace.name.toString(),
    ])
    .send(`${seller.name.toString()}@active`);
  if (transfer) {
    await transferNfts(atomicassets!, seller, atomicmarket, nfts, 'auction');
  }
};

export const startAnnouncedAuction = async (
  atomicassets: Account,
  atomicmarket: Account,
  seller: Account,
  nfts: Array<NFT>,
) => {
  transferNfts(atomicassets!, seller, atomicmarket, nfts, 'auction');
};
