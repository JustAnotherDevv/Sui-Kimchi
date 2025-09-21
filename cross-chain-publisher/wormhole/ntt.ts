// src/ntt.ts
import "dotenv/config";
import {
  Wormhole,
  amount,
  TransactionId,
  signSendWait,
  ChainAddress,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/platforms/evm";
import suiPlatform from "@wormhole-foundation/sdk/platforms/sui";
import "@wormhole-foundation/sdk-evm-ntt";
import "@wormhole-foundation/sdk-sui-ntt";

import {
  JsonRpcProvider,
  Wallet,
  Contract,
  Interface,
  isHexString,
} from "ethers";

import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const SEPOLIA_RPC = need("SEPOLIA_RPC");
const SEPOLIA_PK = need("SEPOLIA_PK");
const SUI_RPC = process.env.SUI_RPC ?? "https://fullnode.testnet.sui.io";
const SUI_PRIVKEY = need("SUI_PRIVATE_KEY");

const SEND_AMOUNT = process.env.SEND_AMOUNT ?? "1.0";
const VAA_TIMEOUT = Number(process.env.VAA_TIMEOUT ?? 180_000);

const DEPLOY = {
  Sepolia: {
    token: "0xd8A615aE2Ba333174ef4A06D3ae7A1E0bd24473D",
    manager: "0xF3c1c67543A71524fF6EdDADECC0b2D6567720Db",
    transceiver: "0x6d16418C3202FD5942bd2fed5fD98BdD26EFc56A",
  },
  Sui: {
    token:
      "0x3eb935f1ec4f0b4ab6001f90dc34599be58304d22414f5e4315fc61d0a471c16::my_token::MY_TOKEN",
    manager:
      "0x952901fe49fb3bbcc1067d2aa317fbab519f2a4ab4cb97f33c4f516a9ddc5746",
    transceiver:
      "0x04848bfe86f04a05599f13776f9af75e76377ff25f176647e13cc090f226d178",
  },
} as const;

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const MANAGER_ABI = [
  "function transfer(uint256 amount,uint16 recipientChain,bytes32 recipient,bytes32 refundAddress,bool shouldQueue,bytes transceiverInstructions) payable",
];

const TRANSCEIVER_ABI = [
  "function quoteDeliveryPrice(uint16 dstChain, bytes transceiverInstructions) view returns (uint256)",
];

const toBytes32 = (hex: string) => {
  if (!isHexString(hex)) throw new Error(`Not hex: ${hex}`);
  const h = hex.toLowerCase().replace(/^0x/, "");
  if (h.length > 64) throw new Error(`Hex too long for bytes32: ${hex}`);
  return "0x" + h.padStart(64, "0");
};

const evmToUniversal = (evmAddr: string) => toBytes32(evmAddr);
const suiToUniversal = (suiAddr32Hex: string) => toBytes32(suiAddr32Hex);

(async () => {
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new Wallet(SEPOLIA_PK, provider);
  const senderEvm = await wallet.getAddress();
  console.log("Sepolia signer:", senderEvm);

  const suiClient = new SuiClient({ url: SUI_RPC });
  const { schema, secretKey } = decodeSuiPrivateKey(SUI_PRIVKEY);
  if (schema !== "ED25519")
    throw new Error(`Unsupported Sui key schema: ${schema}`);
  const suiKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  const suiRecipient =
    process.env.SUI_RECIPIENT ?? suiKeypair.getPublicKey().toSuiAddress();

  const wh = new Wormhole("Testnet", [evm.Platform, suiPlatform.Platform], {
    chains: {
      Sepolia: { rpc: SEPOLIA_RPC },
      Sui: { rpc: SUI_RPC },
    },
  });

  const src = wh.getChain("Sepolia");
  const dst = wh.getChain("Sui");
  const srcNtt = await src.getProtocol("Ntt", {
    ntt: {
      token: DEPLOY.Sepolia.token,
      manager: DEPLOY.Sepolia.manager,
      transceiver: { wormhole: DEPLOY.Sepolia.transceiver },
    },
  });
  const dstNtt = await dst.getProtocol("Ntt", {
    ntt: {
      token: DEPLOY.Sui.token,
      manager: DEPLOY.Sui.manager,
      transceiver: { wormhole: DEPLOY.Sui.transceiver },
    },
  });

  const decs = await srcNtt.getTokenDecimals();
  const units = amount.units(amount.parse(SEND_AMOUNT, decs));

  const dstChainIdU16 = 21;
  const recipientUni = suiToUniversal(suiRecipient);
  const refundUni = evmToUniversal(senderEvm);

  console.log(`→ Sending ${SEND_AMOUNT} from Sepolia → ${suiRecipient}`);

  const token = new Contract(DEPLOY.Sepolia.token, ERC20_ABI, wallet);
  const manager = new Contract(DEPLOY.Sepolia.manager, MANAGER_ABI, wallet);
  const xceiver = new Contract(
    DEPLOY.Sepolia.transceiver,
    TRANSCEIVER_ABI,
    wallet
  );

  const currentAllowance: bigint = await token.allowance(
    senderEvm,
    DEPLOY.Sepolia.manager
  );
  if (currentAllowance < units) {
    const aprov = await token.approve(DEPLOY.Sepolia.manager, units);
    await aprov.wait();
  }

  const EMPTY_INSTR = "0x";
  let requiredFee: bigint;
  try {
    requiredFee = await xceiver.quoteDeliveryPrice(dstChainIdU16, EMPTY_INSTR);
  } catch (e) {
    console.error(
      "Transceiver quoteDeliveryPrice reverted — check transceiver address / dstChainId."
    );
    throw e;
  }
  const msgValue = (requiredFee * 110n) / 100n;

  const iface = new Interface(MANAGER_ABI);
  const data = iface.encodeFunctionData("transfer", [
    units,
    dstChainIdU16,
    recipientUni,
    refundUni,
    false,
    EMPTY_INSTR,
  ]);

  console.log("Manager tx preview:", {
    to: DEPLOY.Sepolia.manager,
    dataPrefix: data.slice(0, 10),
    sendingValueWei: msgValue.toString(),
    note: "value from transceiver.quoteDeliveryPrice + 10% buffer",
  });

  await wallet.estimateGas({
    to: DEPLOY.Sepolia.manager,
    data,
    value: msgValue,
  });

  const sent = await wallet.sendTransaction({
    to: DEPLOY.Sepolia.manager,
    data,
    value: msgValue,
  });
  const rcpt = await sent.wait();
  if (!rcpt || rcpt.status !== 1n) throw new Error("Source transfer tx failed");
  const sourceTxId = rcpt.hash as string;
  console.log("Source tx:", sourceTxId);

  console.log("Waiting for VAA…", { sourceTxId });
  const vaa = await wh.getVaa(sourceTxId, "Ntt:WormholeTransfer", VAA_TIMEOUT);
  if (!vaa) throw new Error("Timed out waiting for VAA");

  const redeemGen = dstNtt.redeem([vaa], suiRecipient);
  const suiReceipts: string[] = [];
  for await (const step of redeemGen as any) {
    const tx: any = step.transaction;
    const exec = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: suiKeypair,
      options: { showEffects: true },
    } as any);
    const digest = exec.digest ?? exec.effects?.transactionDigest;
    console.log("Sui tx:", digest);
    suiReceipts.push(digest);
  }

  console.log(
    "✅ Done. WormholeScan:",
    `https://wormholescan.io/#/tx/${sourceTxId}?network=Testnet`
  );
  console.log("Sui receipts:", suiReceipts);
})().catch((e) => {
  console.error("❌ NTT transfer failed:", e);
  process.exit(1);
});
