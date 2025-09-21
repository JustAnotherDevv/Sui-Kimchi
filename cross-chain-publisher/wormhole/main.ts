import "dotenv/config";

function printVersions() {
  try {
    const v = (m: string) => `${m}@${require(`${m}/package.json`).version}`;
    console.log(
      "\n== Wormhole package versions ==",
      v("@wormhole-foundation/sdk"),
      v("@wormhole-foundation/sdk-connect"),
      v("@wormhole-foundation/sdk-route-ntt"),
      v("@wormhole-foundation/sdk-definitions-ntt"),
      v("@wormhole-foundation/sdk-evm"),
      v("@wormhole-foundation/sdk-sui"),
      v("@wormhole-foundation/sdk-evm-ntt"),
      v("@wormhole-foundation/sdk-sui-ntt")
    );
  } catch {}
}

import { wormhole, Wormhole, amount } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import sui from "@wormhole-foundation/sdk/sui";

import "@wormhole-foundation/sdk-definitions-ntt";
import "@wormhole-foundation/sdk-evm-ntt";
import "@wormhole-foundation/sdk-sui-ntt";

import * as RouteNtt from "@wormhole-foundation/sdk-route-ntt";

import { ethers } from "ethers";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { NTT } from "./ntt.addresses";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

function makeEvmSigner() {
  const provider = new ethers.JsonRpcProvider(need("SEPOLIA_RPC"));
  return new ethers.Wallet(need("SEPOLIA_PK"), provider);
}
function makeSui() {
  const client = new SuiClient({
    url: process.env.SUI_RPC ?? "https://fullnode.testnet.sui.io",
  });
  const keypair = Ed25519Keypair.deriveKeypair(need("SUI_MNEMONIC"));
  return { client, keypair };
}

function buildGroup() {
  const group = {
    Sepolia: {
      token: NTT.Sepolia.token,
      manager: NTT.Sepolia.manager,
      transceiver: { wormhole: NTT.Sepolia.transceiver },
    },
    Sui: {
      token: NTT.Sui.token,
      manager: NTT.Sui.manager,
      transceiver: { wormhole: NTT.Sui.transceiver },
    },
  } as const;

  for (const [ch, cfg] of Object.entries(group)) {
    if (!cfg.token) throw new Error(`Missing token for ${ch}`);
    if (!cfg.manager) throw new Error(`Missing manager for ${ch}`);
    if (!cfg.transceiver?.wormhole)
      throw new Error(`Missing wormhole transceiver for ${ch}`);
  }
  return group;
}

function buildRoutes(group: any) {
  const payloadTokens = { tokens: { MYTOKEN: group } };
  const payloadGroups = { groups: { MYTOKEN: group } };

  if (typeof (RouteNtt as any).nttRoutes === "function") {
    return (
      (RouteNtt as any).nttRoutes(payloadTokens) ??
      (RouteNtt as any).nttRoutes(payloadGroups)
    );
  }

  const routes: any[] = [];
  if (typeof (RouteNtt as any).nttAutomaticRoute === "function") {
    routes.push((RouteNtt as any).nttAutomaticRoute({ chains: group }));
  } else if (
    typeof (RouteNtt as any).NttAutomaticRoute?.config === "function"
  ) {
    routes.push((RouteNtt as any).NttAutomaticRoute.config({ chains: group }));
  }
  if (typeof (RouteNtt as any).nttManualRoute === "function") {
    routes.push((RouteNtt as any).nttManualRoute({ chains: group }));
  } else if (typeof (RouteNtt as any).NttManualRoute?.config === "function") {
    routes.push((RouteNtt as any).NttManualRoute.config({ chains: group }));
  }

  if (!routes.length) {
    throw new Error(
      "Could not find a compatible NTT route builder in @wormhole-foundation/sdk-route-ntt. " +
        `Exports available: ${Object.keys(RouteNtt).join(", ")}`
    );
  }
  return routes;
}

async function main() {
  printVersions();

  console.log("\nInitializing Wormhole SDK...");
  const wh = await wormhole("Testnet", [evm, sui]);
  console.log("Wormhole SDK Initialized!");
  console.log(
    `Sui chainId=${wh.getChain("Sui").config.chainId} rpc=${
      wh.getChain("Sui").config.rpc
    }`
  );
  console.log(
    `Sepolia chainId=${wh.getChain("Sepolia").config.chainId} rpc=${
      wh.getChain("Sepolia").config.rpc
    }`
  );

  const group = buildGroup();
  const routes = buildRoutes(group);

  const resolver: any =
    (wh as any).createRouteResolver?.(routes) ?? (wh as any).resolver?.(routes);

  const plugins = (resolver as any)?._routes ?? [];
  console.log("\n== Resolver registered plugins ==");
  console.log(plugins.map((r: any) => r?.routeName ?? r?.constructor?.name));
  if (!plugins.length)
    throw new Error("Resolver has 0 plugins (route registration failed)");

  const src = "Sepolia" as const;
  const dst = "Sui" as const;
  const fromToken = Wormhole.tokenId(src, group.Sepolia.token);
  const toToken = Wormhole.tokenId(dst, group.Sui.token);

  const req =
    (await resolver.createRequest?.({ from: fromToken, to: toToken })) ??
    (await resolver.transferRequest?.({ from: fromToken, to: toToken })) ??
    (async () => {
      const route = plugins[0];
      if (!route?.createRequest) throw new Error("Route missing createRequest");
      return route.createRequest(wh, { from: fromToken, to: toToken });
    })();

  const chosen =
    req.routes?.find((r: any) =>
      `${r.routeName ?? ""}`.toLowerCase().includes("automatic")
    ) ??
    req.routes?.[0] ??
    req;

  console.log("\n== Chosen route ==");
  console.log(chosen.routeName ?? chosen.constructor?.name ?? "(unknown)");

  const decimals =
    (await chosen.getTokenDecimals?.()) ?? (await req.decimals?.()) ?? 18;

  const units = amount.units(
    amount.parse(process.env.SEND_AMOUNT ?? "1.0", decimals)
  );

  const { client: suiClient, keypair: suiKeypair } = makeSui();
  const recipient = await wh
    .getChain(dst)
    .parseAddress(
      process.env.SUI_RECIPIENT ??
        `0x${suiKeypair.getPublicKey().toSuiAddress()}`
    );

  const quote =
    (await chosen.quote?.({ amount: units, recipient })) ??
    (await chosen.getQuote?.({ amount: units, recipient })) ??
    undefined;

  const txs =
    (await chosen.initiate?.({ amount: units, recipient, quote })) ??
    (await chosen.transfer?.({ amount: units, recipient })) ??
    (await chosen.build?.({ amount: units, recipient })) ??
    (() => {
      throw new Error("Route did not produce transactions");
    })();

  console.log(`\n== Built ${txs.length} tx bundle(s) ==`);

  const evmSigner = makeEvmSigner();
  const receipts: any[] = [];

  for (const step of txs) {
    const chain = step.chain ?? step.source?.chain ?? step.tx?.chain;
    if (chain === "Sepolia") {
      const resp = await evmSigner.sendTransaction(step.tx);
      console.log("EVM tx:", resp.hash);
      await resp.wait();
      receipts.push({ chain, txid: resp.hash });
    } else if (chain === "Sui") {
      const exec = await suiClient.signAndExecuteTransaction({
        transaction: step.tx,
        signer: suiKeypair,
        options: { showEffects: true },
      } as any);
      const txid = exec.digest ?? exec.effects?.transactionDigest;
      console.log("Sui tx:", txid);
      receipts.push({ chain, txid });
    } else {
      console.warn("Unknown chain in bundle; skipping:", chain);
    }
  }

  console.log("\n== Receipts ==");
  console.log(JSON.stringify(receipts, null, 2));
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
