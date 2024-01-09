import { Name, Contract, printStorage, print, TableStore, check } from "proton-tsc"
import { AtomicValue, AtomicAttribute, deserialize, AtomicFormat, ATOMICASSETS_CONTRACT, Assets, Collections, Config, Schemas, Templates } from 'proton-tsc/atomicassets'

@contract
class NftReceiver extends Contract {
    contract: Name = this.receiver

    @action("transfer", notify)
    onReceive(from: Name, to: Name, asset_ids: u64[], memo: string): void {
        // Skip if outgoing
        if (from == this.contract) {
            return;
        }
        // Only handle incoming
        if (to == this.contract) {
            if (memo.includes('collection')) {
                print(memo)
                print(asset_ids.toString())
            }
            else {
                const assetTable = new TableStore<Assets>(ATOMICASSETS_CONTRACT, this.contract)
                print('no need to handle')
            }
        }
    }

    @action("printstorage")
    printstorage(): void {
        printStorage()
    }
}