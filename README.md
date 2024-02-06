## xpr-contracts

This repository includes a variety of different Smart Contracts that are written in TypeScript, well tested and deployed on [XPR Network](https://xprnetwork.org).

## Contracts

-   [powerofsoon](./powerofsoon) includes following logic:
    -   configure start price for auctions of [SOON SPOT NFTs](https://soon.market/soon-spot-nfts)
    -   claim market balance from atomicmarket
    -   claim income of a specific auction from atomicmarket
    -   cancel a specific auction which returns the NFT(s)
    -   mint SOON SPOT Silver NFTs on demand to a specific account
    -   mint and auction SOON SPOT Silver NFTs in XPR given a configurable USD price
        -   price feed oracle is used to determine the XPR price on-demand
    -   handle transfer notifications and perform specific logic:
        -   automatically re-auction a SOON SPOT Silver NFT
        -   forward claimed market balance from atomicmarket automatically to soonfinance
        -   burn an used SOON SPOT Silver NFT, mint a new one & automatically auction it
        -   re-auction the SOON SPOT Gold NFT in XPR at a configurable USD price
-   [soonmarket](./soonmarket) includes following logic:
    -   add/remove NFT collections to/from verified list of the marketplace
    -   add/remove NFT collections to/from blacklist of the marketplace
    -   configure SOON SPOT promotion duration
    -   claim market balance from atomicmarket
    -   handle transfer notifications and perform specific logic:
        -   check for valid SOON SPOT promotion
            -   triggers additional logic to log promotions and send back the SOON SPOT NFT to powerofsoon with specific memo
        -   forward claimed market balance from atomicmarket automatically to soonfinance
        -   forward incoming XPR from nftwatchdao automatically to soonfinance
-   [nftwatchdao](./nftwatchdao) includes following logic:
    -   maintain authorized [Guards](https://nftwatchdao.com/guards)
    -   maintain NFT marketplaces that utilize [Shielding](https://nftwatchdao.com/shielding)
    -   configure the [Shielding Fee](https://nftwatchdao.com/shielding/#shielding-fee) and fee distribution
    -   report NFT collections to [Blacklist](https://nftwatchdao.com/blacklisting)
        -   confirm/reject as Guard
    -   add/remove NFT collections to/from blacklist directly as Guard
    -   request shielding for NFT collections
        -   confirm/reject as Guard
    -   add/remove NFT collections to/from shieldings directly as Guard

## Credits

We want to express our thanks to the amazing XPR community that supported our [grant proposal](https://gov.xprnetwork.org/communities/6/proposals/649383342fe0d5e2eb37c02a). The grant made the development of these contracts possible.

## License

The work included in this repository is licensed under [Apache-2.0](LICENSE).
