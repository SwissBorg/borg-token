import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";

import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking: {
        url: "https://rpc.ankr.com/eth",
      },
    },
    ethereum: {
      url: "https://rpc.ankr.com/eth",
      accounts: [process.env.PRIVATE_KEY || ""],
    },
    sepolia: {
      url: "https://rpc.ankr.com/eth_sepolia",
      accounts: [process.env.PRIVATE_KEY || ""],
    },
  },
  solidity: "0.8.16",
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_KEY || "",
      sepolia: process.env.ETHERSCAN_KEY || "",
    },
  },
};

export default config;
