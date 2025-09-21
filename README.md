# Kimchi

Incentivized SocialFi content publishing platform built on sui with Walrus CMS + custom cross-chain publisher that allows anyone to pay for Walrus storage from EVM chain in any token.

## Overview

## Integrations

### Wormhole

Use of NTT with bridge and burn mechanism in order to allow users to purchase storage on Sui without need to own Walrus token or interact with Sui directly. End users are able to purchase storage with token of their choice on EVM / SVM network of their choice(in current minimal POC it's other EVM testnet with mock stablecoin). After their storage account was refilled they can proceed to store files of their choice, stablecoin that was sent from their wallet to the Walrus Publisher wallet is automatically bridged to Sui network where it's then used for purchase of Walrus token.

Tokens were registered for Wormhole using NTT cli and cross-chain interactions are done using Wormhole Typescript SDK.

**Deployment Addresses**

- NTT Token Ethereum Sepolia: `0xd8A615aE2Ba333174ef4A06D3ae7A1E0bd24473D`
- NTT Token Sui Testnet: `0x3eb935f1ec4f0b4ab6001f90dc34599be58304d22414f5e4315fc61d0a471c16`

### Walrus

All the data that is initially created(markdown text, JSON files, images) is published on Walrus.

### Seal

Seal is used for the access control stored on the platform to prevent users that didn't pay from accessing the token-gated content.

### Sui

Paments for Walrus storage, content access purchase and tips are handled using Sui blockchain.

## Setup

1. Dapp

- `cd dapp`
- `pnpm i`
- fill out `.env`
- Start web app locally `pnpm run dev`

### Store item with local publisher

curl -X PUT "$PUBLISHER/v1/blobs" -d "some string"

### Quey Stored item by blob

curl "https://aggregator.testnet.walrus.atalma.io/v1/blobs/9k95lgtG9iPU8yk_wYz8m8CUY1snveemF8ypfpBLUUg"

{
"blobId": "C4ttoh424ehAyDbmT8KYAqBfr8w-ORe-No5zMO-DypI",
"blobObject": {
"id": {
"id": "0xe367d0473c21d724059d0001e9da930ec3af49b6e4f26ccbf257db6827d77333"
},
"registered_epoch": 170,
"blob_id": "66395489577543336134880737308649700343823866263958369023607708025568040422155",
"size": "414",
"encoding_type": 1,
"certified_epoch": 170,
"storage": {
"id": {
"id": "0x7eb7ad07ecf97aec2725304c41a2c210445e988b4d7cf4975894d32cf2d1eefc"
},
"start_epoch": 170,
"end_epoch": 171,
"storage_size": "66034000"
},
"deletable": false
}
}

{
"blobId": "DNzKjv-LGd-7VrMNz7jnfD-unzzFJpWAEsqk4vtVOmM",
"blobObject": {
"id": {
"id": "0x5467dcdd2a2f41308b9a224db6386728fd896979a62dece1ebcefe8a44dd886b"
},
"registered_epoch": 170,
"blob_id": "44882042578754977714377145462161942671522120396099801652885943001359128910860",
"size": "95483",
"encoding_type": 1,
"certified_epoch": 170,
"storage": {
"id": {
"id": "0x7458be726214e5a51ce568506f1f07c2529da8080bab6865e92369a19448e7f4"
},
"start_epoch": 170,
"end_epoch": 171,
"storage_size": "66034000"
},
"deletable": false
}
}
