import * as fs from "fs";
import { ccc } from "@ckb-ccc/core";
import { createCkbClient } from "./src/ckbClient";
(async () => {
  const d = JSON.parse(fs.readFileSync("../../deployment/testnet-deployer.json", "utf-8"));
  const client = createCkbClient("testnet");
  const s = new ccc.SignerCkbPrivateKey(client, d.privateKey);
  console.log("deployer balance:", Number(await s.getBalance()) / 1e8, "CKB");
})();
