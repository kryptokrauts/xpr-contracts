import fs from 'fs'
import { Account, Blockchain } from "@proton/vert";

const defaultSchema = [
    { "name": "name", "type": "string" },
    { "name": "image", "type": "string" },
    { "name": "description", "type": "string" }
]

const isDebug = false // enable to printStorageDeltas

export const initContracts = async (blockchain: Blockchain, ...contracts: Array<Account>) => {
    blockchain.enableStorageDeltas()
    for(const contract of contracts) {
        await contract.actions.init().send()
        if(isDebug){
            blockchain.printStorageDeltas()
        }
    }
    blockchain.disableStorageDeltas()
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

export const createTestCollection = async (blockchain: Blockchain, atomicassets: Account, creator: Account) => {
    const testCollections = JSON.parse(fs.readFileSync(`common/testdata/collections.json`, 'utf-8'))
    const creatorName = creator.name.toString()
    const collection = testCollections[creatorName]

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
    if(isDebug){
        blockchain.printStorageDeltas()
    }

    // schema
    await atomicassets.actions.createschema([
        creatorName,
        collection.id,
        collection.id, // using same name as collection id is the common approach on XPR Network
        defaultSchema,
    ]).send(`${creatorName}@active`)
    if(isDebug){
        blockchain.printStorageDeltas()
    }

    // nfts
    for(const nft of collection.nfts) {
        let templateId = -1 // minting unique asset without a template
        if (nft.edition)
        await atomicassets.actions.mintasset([
            creatorName,
            collection.id,
            collection.id,
            templateId,
            creatorName,
            [
                { "key": "name", "value": ["string", nft.name]},
                { "key": "image", "value": ["string", nft.media_hash]},
                { "key": "description", "value": ["string", nft.description]},
            ],
            [], // mutable attributes
            [] // tokens to back
        ]).send(`${creatorName}@active`)
        if(isDebug){
            blockchain.printStorageDeltas()
        }
    }
    blockchain.disableStorageDeltas()
}