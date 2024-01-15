import { Asset, EMPTY_NAME, Name, Table } from 'proton-tsc';

// Scope: N/A
@table('auctions', noabigen)
export class Auctions extends Table {
  constructor(
    public auction_id: u64 = 0,
    public seller: Name = EMPTY_NAME,
    public asset_ids: u64[] = [],
    public end_time: u32 = 0,
    public assets_transferred: boolean = false,
    public current_bid: Asset = new Asset(),
    public current_bidder: Name = EMPTY_NAME,
    public claimed_by_seller: boolean = false,
    public claimed_by_buyer: boolean = false,
    public maker_marketplace: Name = EMPTY_NAME,
    public taker_marketplace: Name = EMPTY_NAME,
    public collection_name: Name = EMPTY_NAME,
    public collection_fee: f64 = <f64>0,
  ) {
    super();
  }

  @primary
  get primary(): u64 {
    return this.auction_id;
  }
}
