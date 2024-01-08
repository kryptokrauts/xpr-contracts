import { Name, Contract } from "proton-tsc"

@contract
class NftReceiver extends Contract {
    contract: Name = this.receiver

    @action("transfer", notify)
    handleIncomingNfts(from: Name, to: Name, asset_ids: u64[], memo: string): void {
        // Skip if outgoing
        if (from == this.contract) {
            return;
        }
        // TODO need to check if it is really incoming? (see docs example)

        // TODO example with burn logic
    }
}