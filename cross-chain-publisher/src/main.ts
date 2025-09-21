import express from "express";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient, WalrusFile } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { ethers } from "ethers";
import "dotenv/config";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const PRIV = process.env.SUI_PRIVATE_KEY;
if (!PRIV) {
  console.error("Missing SUI_PRIVATE_KEY (suiprivkey...).");
  process.exit(1);
}
const { secretKey, schema } = decodeSuiPrivateKey(PRIV);
if (schema !== "ED25519") {
  console.error(`Unsupported Sui key schema: ${schema}. Expected ED25519.`);
  process.exit(1);
}
const suiKeypair = Ed25519Keypair.fromSecretKey(secretKey);
const suiOwner = suiKeypair.toSuiAddress();

const suiClient = new SuiClient({
  url: process.env.SUI_FULLNODE || getFullnodeUrl("testnet"),
});

const walrusClient = new WalrusClient({
  network: "testnet",
  suiClient,
});

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_PRIVATE_KEY || !EVM_RPC_URL) {
  console.error("Missing EVM_PRIVATE_KEY or EVM_RPC_URL.");
  process.exit(1);
}
const evmProvider = new ethers.JsonRpcProvider(EVM_RPC_URL);
const evmWallet = new ethers.Wallet(EVM_PRIVATE_KEY, evmProvider);
const publisherEvmAddress = evmWallet.address;

const STORE_FEE_WEI = ethers.parseEther(process.env.STORE_FEE ?? "0.01");

type UserState = {
  balanceWei: bigint;
  creditedTxs: Set<string>;
};
const users = new Map<string, UserState>();

function norm(addr: string) {
  if (!addr) throw new Error("Missing address");
  return ethers.getAddress(addr).toLowerCase();
}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(
  express.raw({
    type: ["application/octet-stream", "binary/octet-stream"],
    limit: "50mb",
  })
);

app.get("/health", async (_req, res) => {
  const net = await evmProvider.getNetwork();
  res.json({
    ok: true,
    suiOwner,
    evm: { chainId: net.chainId.toString(), publisherEvmAddress },
    storeFeeWei: STORE_FEE_WEI.toString(),
    network: "sui:testnet",
  });
});

app.get("/evm/address", (_req, res) => {
  res.json({ ok: true, publisherEvmAddress, feeWei: STORE_FEE_WEI.toString() });
});

app.post("/evm/register", (req, res) => {
  try {
    const userEvmAddress = norm(req.body?.userEvmAddress);
    if (!users.has(userEvmAddress)) {
      users.set(userEvmAddress, { balanceWei: 0n, creditedTxs: new Set() });
    }
    const u = users.get(userEvmAddress)!;
    res.json({
      ok: true,
      publisherEvmAddress,
      userEvmAddress,
      balanceWei: u.balanceWei.toString(),
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/evm/topup/confirm", async (req, res) => {
  try {
    const userEvmAddress = norm(req.body?.userEvmAddress);
    const txHash = String(req.body?.txHash || "").toLowerCase();
    const minConf =
      req.body?.minConfirmations !== undefined
        ? Number(req.body.minConfirmations)
        : 1;

    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
      return res.status(400).json({ ok: false, error: "Invalid txHash" });
    }
    if (!users.has(userEvmAddress)) {
      return res.status(400).json({
        ok: false,
        error: "User not registered. Call /evm/register first.",
      });
    }
    const u = users.get(userEvmAddress)!;

    if (u.creditedTxs.has(txHash)) {
      return res.json({
        ok: true,
        alreadyCredited: true,
        txHash,
        balanceWei: u.balanceWei.toString(),
      });
    }

    const tx = await evmProvider.getTransaction(txHash);
    if (!tx)
      return res
        .status(404)
        .json({ ok: false, error: "Transaction not found" });
    if (!tx.to || !tx.from) {
      return res
        .status(400)
        .json({ ok: false, error: "Tx missing to/from fields" });
    }

    const fromAddr = tx.from.toLowerCase();
    const toAddr = tx.to.toLowerCase();
    if (fromAddr !== userEvmAddress) {
      return res
        .status(400)
        .json({ ok: false, error: "Tx 'from' does not match userEvmAddress" });
    }
    if (toAddr !== publisherEvmAddress.toLowerCase()) {
      return res
        .status(400)
        .json({ ok: false, error: "Tx 'to' does not match publisher address" });
    }

    const receipt = await evmProvider.getTransactionReceipt(txHash);
    if (!receipt)
      return res.status(400).json({ ok: false, error: "Tx not yet mined" });

    const statusOk =
      receipt.status === 1 ||
      (receipt as any).status === 1n ||
      receipt.status == null;
    if (!statusOk) {
      return res
        .status(400)
        .json({ ok: false, error: "Tx failed (status != 1)" });
    }

    const confirmations =
      (receipt as any).confirmations ??
      (receipt.blockNumber != null
        ? (await evmProvider.getBlockNumber()) - Number(receipt.blockNumber) + 1
        : 0);

    if (confirmations < minConf) {
      return res.status(400).json({
        ok: false,
        error: "Insufficient confirmations",
        confirmations,
        required: minConf,
      });
    }

    const value = tx.value ?? 0n;
    if (value <= 0n)
      return res.status(400).json({ ok: false, error: "Tx value is zero" });

    u.balanceWei += value;
    u.creditedTxs.add(txHash);
    users.set(userEvmAddress, u);

    return res.json({
      ok: true,
      txHash,
      creditedWei: value.toString(),
      balanceWei: u.balanceWei.toString(),
      from: tx.from,
      to: tx.to,
      confirmations,
    });
  } catch (e: any) {
    console.error("topup/confirm error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/evm/balance", (req, res) => {
  try {
    const user = req.query.user as string;
    const userKey = norm(user);
    const u = users.get(userKey);
    if (!u)
      return res.status(404).json({ ok: false, error: "User not registered" });
    res.json({
      ok: true,
      userEvmAddress: userKey,
      balanceWei: u.balanceWei.toString(),
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/publish", async (req, res) => {
  try {
    const isBinary = Buffer.isBuffer(req.body);

    const userEvmAddress =
      (req.query.userEvmAddress as string) ||
      (typeof req.body?.userEvmAddress === "string"
        ? req.body.userEvmAddress
        : "");
    const userKey = norm(userEvmAddress);

    const filename =
      (req.query.filename as string) ||
      (typeof req.body?.filename === "string"
        ? req.body.filename
        : undefined) ||
      "file.txt";

    const epochs =
      req.query.epochs !== undefined
        ? Number(req.query.epochs)
        : typeof req.body?.epochs === "number"
        ? req.body.epochs
        : 3;

    const deletable =
      req.query.deletable !== undefined
        ? String(req.query.deletable).toLowerCase() === "true"
        : typeof req.body?.deletable === "boolean"
        ? req.body.deletable
        : false;

    if (!users.has(userKey)) {
      return res.status(400).json({
        ok: false,
        error: "User not registered. Call /evm/register first.",
      });
    }
    const u = users.get(userKey)!;
    if (u.balanceWei < STORE_FEE_WEI) {
      return res.status(402).json({
        ok: false,
        error:
          "Insufficient top-up. Send native tokens to publisher and confirm via /evm/topup/confirm.",
        balanceWei: u.balanceWei.toString(),
        requiredWei: STORE_FEE_WEI.toString(),
        publisherEvmAddress,
      });
    }

    let bytes: Uint8Array;
    let contentType = "text/plain";

    if (isBinary) {
      bytes = new Uint8Array(req.body as Buffer);
      contentType = "application/octet-stream";
    } else if (typeof req.body?.text === "string") {
      bytes = new TextEncoder().encode(req.body.text);
      contentType = "text/plain";
    } else {
      return res.status(400).json({
        ok: false,
        error: "Provide raw binary body or JSON with a 'text' field.",
      });
    }

    u.balanceWei -= STORE_FEE_WEI;
    users.set(userKey, u);

    const walrusFile = WalrusFile.from({
      contents: bytes,
      identifier: filename,
      tags: { "content-type": contentType },
    });

    const flow = walrusClient.writeFilesFlow({ files: [walrusFile] });
    await flow.encode();

    const registerTx = flow.register({
      epochs,
      owner: suiOwner,
      deletable,
    });
    const { digest } = await suiClient.signAndExecuteTransaction({
      transaction: registerTx,
      signer: suiKeypair,
    });

    await flow.upload({ digest });

    const certifyTx = flow.certify();
    await suiClient.signAndExecuteTransaction({
      transaction: certifyTx,
      signer: suiKeypair,
    });

    const files = await flow.listFiles();
    const { blobId } = flow;

    return res.json({
      ok: true,
      blobId,
      files,
      feeChargedWei: STORE_FEE_WEI.toString(),
      remainingBalanceWei: users.get(userKey)!.balanceWei.toString(),
    });
  } catch (err: any) {
    console.error("Publish error:", err);
    return res
      .status(500)
      .json({ ok: false, error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`EVMPublisher listening on http://localhost:${PORT}`);
  console.log(`Sui owner: ${suiOwner}`);
  console.log(`EVM publisher: ${publisherEvmAddress}`);
});
