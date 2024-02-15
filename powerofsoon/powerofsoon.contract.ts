import { Contract, Name, TableStore, unpackActionData } from 'proton-tsc';
import { Transfer, sendTransferToken } from 'proton-tsc/token';
import { ATOMICASSETS_CONTRACT } from 'proton-tsc/atomicassets';
import { ERROR_MARKET_BALANCE_NOT_FOUND } from './powerofsoon.constants';
import { Balances } from '../external/atomicmarket/atomicmarket.tables';
import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants';
import { sendAuctionClaimSeller, sendWithdraw } from '../external/atomicmarket/atomicmarket.inline';
import { sendClaimMarketBalance } from './powerofsoon.inline';

@contract
class PowerOfSoon extends Contract {
    contract: Name = this.receiver;

    // atomicmarket tables
    amBalances: TableStore<Balances> = new TableStore<Balances>(ATOMICMARKET_CONTRACT);

    /**
     * Claims balance from atomicmarket contract.
     */
    @action('clmktbalance')
    claimMarketBalance(): void {
        const balancesRow = this.amBalances.requireGet(this.contract.N, ERROR_MARKET_BALANCE_NOT_FOUND);
        for (let i = 0; i < balancesRow.quantities.length; i++) {
            // incoming token transfer will trigger payment forward to soonfinance
            sendWithdraw(this.contract, this.contract, balancesRow.quantities[i]);
        }
    }

    /**
     * Claims earnings from a specific auction which was hosted by the contract.
     * @param {u64} auctionId - id of the auction
     */
    @action('claimauctinc') // can be called by anybody
    claimAuctionIncome(auctionId: u64): void {
        // incoming token transfer will trigger payment forward to soonfinance
        sendAuctionClaimSeller(this.contract, auctionId);
        // also claim market balance to withdraw royalties
        sendClaimMarketBalance(this.contract);
    }

    @action('transfer', notify)
    onTransfer(): void {
        // skip notification comes from atomicassets
        if (ATOMICASSETS_CONTRACT == this.firstReceiver) {
            return;
        } else {
            // otherwise we expect a regular token transfer
            const actionParams = unpackActionData<Transfer>();
            // skip outgoing transfers & transfers from other accounts than atomicmarket
            if (actionParams.from == this.contract || ATOMICMARKET_CONTRACT != actionParams.from) {
                return;
            }
            // forward tokens to soonfinance
            // we do not check firstReceiver for now. at this point it is safe to assume that tokens supported by atomicmarket can be trusted
            sendTransferToken(
                this.firstReceiver,
                this.contract,
                Name.fromString('soonfinance'),
                actionParams.quantity,
                'nft sale proceeds & royalties',
            );
        }
    }
}
