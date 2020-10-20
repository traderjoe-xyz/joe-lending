import { BuidlerConfig } from "@nomiclabs/buidler/config";

const config: BuidlerConfig = {
  defaultNetwork: "buidlerevm",
  solc: {
    version: "0.5.17",
    optimizer: { enabled: true, runs: 200 }
  },
};

export default config;
