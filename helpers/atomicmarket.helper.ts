import { Account, Blockchain } from "@proton/vert";
import { TokenSymbol, isDebug } from "./common.ts";

export const addTokens = async (blockchain: Blockchain, atomicmarket: Account, tokenContract: Account, tokenSymbols: Array<TokenSymbol>) => {
    for (let i=0; i<tokenSymbols.length; i++) {
        blockchain.enableStorageDeltas()
        await atomicmarket.actions.addconftoken([
            tokenContract.name,
            `${tokenSymbols[i].precision},${tokenSymbols[i].name}`
        ]).send()
        if (isDebug) {
            blockchain.printStorageDeltas()
        }
        blockchain.disableStorageDeltas()
    }
}