import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
  },
};

if (process.env.RPC_URL && process.env.PRIVATE_KEY) {
  config.networks.sepolia = {
    url: process.env.RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
  };
}

export default config;