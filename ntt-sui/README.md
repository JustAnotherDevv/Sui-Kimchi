# Example NTT Token Sui

This repository contains a Sui Move smart contract that can be used for multichain token deployments.

## Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) installed
- Basic understanding of Move language

## Setup and Testing Steps

### 1. Create Testnet Environment
```bash
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
```

### 2. Switch to Testnet Environment
```bash
sui client switch --env testnet
```

### 3. Generate New Address (save the recovery phrase for your ntt deployment!)
```bash
sui client new-address ed25519
```

### 4. View Account Information
```bash
sui client active-address
```

### 5. Switch to Generated Address
```bash
sui client switch --address YOUR_GENERATED_ADDRESS
```

### 6. Get Test Coins
```bash
sui client faucet
```

### 7. Check Balance
```bash
sui client balance
```

Before deploying, you can modify the coin properties in `sources/my_coin.move`:

### **Coin Properties:**
```move
let decimals: u8 = 9;                    // Number of decimal places
let symbol = b"WSV";                     // Coin symbol
let name = b"My Coin";                   // Coin name
let description = b"";                    // Coin description
let icon = option::some(url::new_unsafe_from_bytes(b"https://example.com/icon.png"));
```

### **What to Change:**
- **`decimals`**: Change from `9` to your preferred precision (e.g., `6` for 6 decimals)
- **`symbol`**: Change `"WSV"` to your coin symbol 
- **`name`**: Change `"My Coin"` to your coin name 
- **`description`**: Add a description for your coin
- **`icon`**: Change the URL to your coin's icon image

### 8. Build the Project
```bash
sui move build
```

### 9. Deploy the Coin to Testnet
```bash
sui client publish --gas-budget 20000000
```

**⚠️ Important: After deployment, look for the "Published Objects" section and save the PackageID:**

```
PackageID: 0x67ad495772e4cf74ef6bf911708973fbad23c7646129dea62ec82492a220a40d
```

**Save the PackageID - you'll need it for the minting step!**

### 10. Verify Deployment
```bash
sui client objects 
```

**This command shows:**
- **UpgradeCap**: Look for `0x0000..0002::package::UpgradeCap` (for package upgrades)
- **Coin Metadata**: Look for `0x0000..0002::coin::CoinMetadata` (your coin metadata)
- **TreasuryCap**: Look for `0x0000..0002::coin::TreasuryCap` (for minting/burning)

**Find the TreasuryCap ID here - you'll need it for the minting step!**

### 11. Mint MY_COIN Coins
```bash
sui client call \
    --package YOUR_DEPLOYED_PACKAGE_ID_STEP9 \
    --module MODULE_NAME \
    --function mint \
    --args TREASURYCAP_ID_STEP10 AMOUNT_WITH_DECIMALS RECIPIENT_ADDRESS \
    --gas-budget 5000000
```

**Mint Command Arguments Explained:**
- **`--package`**: Your deployed package ID (contains the my_coin module)
- **`--module`**: The module name within your package
- **`--function`**: The function to call (mint)
- **`--args`**: Three arguments separated by spaces:
  1. **TreasuryCap ID**: `TREASURYCAP_ID_STEP10` (minting authority object)
  2. **Amount**: `1000000000` (1 MY_COIN with 9 decimals = 1 * 10^9)
  3. **Recipient**: `RECIPIENT_ADDRESS` (recipient/your address)
- **`--gas-budget`**: Maximum gas to spend (in MIST)

### 12. Check MY_COIN Balance
```bash
sui client balance --coin-type YOUR_PACKAGE_ID::MODULE_NAME::MY_COIN
```

**Balance Command Explained:**
- **`--coin-type`**: The full type identifier for your MY_COIN coin
- **Format**: `YOUR_PACKAGE_ID::MODULE_NAME::MY_COIN` (replace with actual values from step 9)
- **Shows**: Balance of MY_COIN coins for the currently active address
- **Format**: Amount in smallest units (divide by 10^9 to get actual MY_COIN amount)

## Understanding Placeholder Values

Throughout this README, you'll see placeholder values that need to be replaced with your actual values:

- **`YOUR_GENERATED_ADDRESS`**: The address from step 3 (`sui client new-address ed25519`)
- **`YOUR_DEPLOYED_PACKAGE_ID_STEP9`**: The package ID from step 9 deployment output
- **`MODULE_NAME`**: Your module name (default: `my_coin`)
- **`TREASURYCAP_ID_STEP10`**: The TreasuryCap ID from step 10 deployment output
- **`RECIPIENT_ADDRESS`**: The address to receive minted coins
- **`AMOUNT_WITH_DECIMALS`**: Amount in smallest units (e.g., `1000000000` for 1 coin with 9 decimals)

## Update Coin Metadata

After deploying your coin, you can update its metadata using the Sui CLI. You'll need your `TreasuryCap` and `CoinMetadata` object IDs from step 10.

### Update Coin Name
```bash
sui client call \
    --package 0x0000000000000000000000000000000000000000000000000000000000000002 \
    --module coin \
    --function update_name \
    --type-args <PACKAGE_ID::MODULE::COIN> \
    --args TREASURY_CAP_ID COIN_METADATA_ID "New Name" \
    --gas-budget 10000000
```

**Command Arguments Explained:**
- **`--module`**: Use `coin` (the Sui framework module)
- **`--function`**: The update function (`update_name`)
- **`--type-args`**: Your coin type in format `PACKAGE_ID::my_coin::MY_COIN`
- **`--args`**: Three arguments:
  1. **TreasuryCap ID**: Your treasury capability object ID
  2. **CoinMetadata ID**: Your coin metadata object ID
  3. **New Name**: The new coin name
- **`--gas-budget`**: Maximum gas to spend 

**Note**: You can only update metadata if you own the `TreasuryCap` object. 

For more details on updating metadata of your Coin, see the [Sui Coin Framework Documentation](https://docs.sui.io/references/framework/sui/coin#sui_coin_update_name).