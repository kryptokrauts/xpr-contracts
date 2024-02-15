import { ActionData, InlineAction, Name, PermissionLevel } from 'proton-tsc';

/* Empty ActionData */
@packer
export class EmptyData extends ActionData {
    constructor() {
        super();
    }
}

/**
 * Send the clmktbalance action of the contract to the blockchain
 * @param {Name} contractAndActor - contract and actor of the action
 */
export function sendClaimMarketBalance(contractAndActor: Name): void {
    new InlineAction<EmptyData>('clmktbalance')
        .act(contractAndActor, new PermissionLevel(contractAndActor))
        .send(new EmptyData());
}
