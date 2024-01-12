import fs from 'fs'
import { Account, Blockchain, nameToBigInt } from "@proton/vert";
import { isDebug } from './common.ts';

const defaultSchema = [
    { "name": "name", "type": "string" },
    { "name": "image", "type": "string" },
    { "name": "description", "type": "string" }
]

export const transferNft = async(
    atomicassets: Account,
    sender: Account,
    recipient: Account,
    nfts: Array<Number>,
    memo: string) => {
        return atomicassets.actions.transfer([
            sender.name.toString(),
            recipient.name.toString(),
            nfts,
            memo
        ]).send(`${sender.name.toString()}@active`)
}

export const initialAdminColEdit = async (atomicassets: Account) => {
    atomicassets.actions.admincoledit([
        [
          { "name": "name", "type": "string" },
          { "name": "img", "type": "ipfs" },
          { "name": "description", "type": "string" },
          { "name": "url", "type": "string" },
          { "name": "images", "type": "string" },
          { "name": "socials", "type": "string" },
          { "name": "creator_info", "type": "string" },
        ]
    ]).send()
}

export const createTestCollection = async (blockchain: Blockchain, atomicassets: Account, creator: Account, recipient?: Account) => {
    const testCollections = JSON.parse(fs.readFileSync('testdata/collections.json', 'utf-8'))
    const creatorName = creator.name.toString()
    const collection = testCollections[creatorName]

    const recipientName = recipient ? recipient.name.toString() : creatorName

    blockchain.enableStorageDeltas()
    // collection
    await atomicassets.actions.createcol([
        creatorName,
        collection.id,
        collection.allow_notify,
        [creatorName],
        [creatorName],
        0.15,
        []
    ]).send(`${creatorName}@active`)
    if (isDebug) {
        blockchain.printStorageDeltas()
    }

    // schema
    await atomicassets.actions.createschema([
        creatorName,
        collection.id,
        collection.id, // using same name as collection id is the common approach on XPR Network
        defaultSchema,
    ]).send(`${creatorName}@active`)
    if (isDebug) {
        blockchain.printStorageDeltas()
    }

    // nfts
    for (const nft of collection.nfts) {
        if (nft.edition) {
            await atomicassets.actions.createtempl([
                creatorName,
                collection.id,
                collection.id,
                nft.edition.transferable,
                nft.edition.burnable,
                nft.edition.size,
                [
                    { "key": "name", "value": ["string", nft.name]},
                    { "key": "image", "value": ["string", nft.media_hash]},
                    { "key": "description", "value": ["string", nft.description]},
                ],
            ]).send(`${creatorName}@active`)
            if (isDebug) {
                blockchain.printStorageDeltas()
            }
            const lastTemplateRow = atomicassets.tables.templates(nameToBigInt(collection.id)).getTableRows().reverse()[0]
            for(let i=0; i<nft.edition.mint_count; i++) {
                await atomicassets.actions.mintasset([
                    creatorName,
                    collection.id,
                    collection.id,
                    lastTemplateRow.template_id,
                    recipientName,
                    [], // immutable attributes (not needed as those are defined in template already)
                    [], // mutable attributes
                    [] // tokens to back
                ]).send(`${creatorName}@active`)
            }
        } else {
            await atomicassets.actions.mintasset([
                creatorName,
                collection.id,
                collection.id,
                -1, // minting unique asset without a template
                recipientName,
                [
                    { "key": "name", "value": ["string", nft.name]},
                    { "key": "image", "value": ["string", nft.media_hash]},
                    { "key": "description", "value": ["string", nft.description]},
                ],
                [], // mutable attributes
                [] // tokens to back
            ]).send(`${creatorName}@active`)
        }
        if (isDebug) {
            blockchain.printStorageDeltas()
        }
    }
    blockchain.disableStorageDeltas()
}