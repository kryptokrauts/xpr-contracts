import { Name, Contract, TableStore, unpackActionData } from 'proton-tsc';
import { Transfer, sendTransferToken } from 'proton-tsc/token';
import { ATOMICASSETS_CONTRACT } from 'proton-tsc/atomicassets';

import { ATOMICMARKET_CONTRACT } from '../external/atomicmarket/atomicmarket.constants';
import { Balances } from '../external/atomicmarket/atomicmarket.tables';
import { sendWithdraw } from '../external/atomicmarket/atomicmarket.inline';
import { ERROR_MARKET_BALANCE_NOT_FOUND } from './soonmarket.constants';

const NFTWATCHDAO = Name.fromString('nftwatchdao');

@contract
class SoonMarket extends Contract {
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
     * Handles an incoming transfer notification and performs promotion and token forwarding logic.
     * @throws if the nft transfer is not a valid promotion
     */
    @action('transfer', notify)
    onTransfer(): void {
        // skip notification comes from atomicassets
        if (ATOMICASSETS_CONTRACT == this.firstReceiver) {
            return;
        } else {
            // otherwise we expect a regular token transfer
            const actionParams = unpackActionData<Transfer>();
            // skip outgoing transfers & transfers from other accounts than atomicmarket & nftwatchdao
            if (
                actionParams.from == this.contract ||
                (ATOMICMARKET_CONTRACT != actionParams.from && NFTWATCHDAO != actionParams.from)
            ) {
                return;
            }
            sendTransferToken(
                this.firstReceiver,
                this.contract,
                Name.fromString('soonfinance'),
                actionParams.quantity,
                NFTWATCHDAO == actionParams.from ? actionParams.memo : 'marketplace revenue',
            );
        }
    }
}
