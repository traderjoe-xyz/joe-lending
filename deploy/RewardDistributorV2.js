const { verify } = require("../utils/index");

const JOE = new Map();
JOE.set("43114", "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd");
JOE.set("43113", "0xaE4EC9901c3076D0DdBe76A520F9E90a6227aCB7");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyOwner;

  const chainId = await getChainId();
  if (chainId == 4) {
    // rinkeby contract addresses
    proxyOwner = deployer.address;
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
  } else if (chainId == 43113) {
    proxyOwner = deployer.address;
  }

  const rewardDistributorV2Deploy = await deploy("RewardDistributorV2", {
    from: deployer,
    proxy: {
      owner: proxyOwner,
      proxyContract: "OpenZeppelinTransparentProxy",
      viaAdminContract: "DefaultProxyAdmin",
      execute: {
        init: {
          methodName: "initialize",
          args: [],
        },
      },
    },
    log: true,
  });
  await rewardDistributorV2Deploy.receipt;

  const rewardDistributorV2 = await ethers.getContract("RewardDistributorV2");
  await rewardDistributorV2.setJoe(JOE.get(chainId));

  if (rewardDistributorV2.newlyDeployed) {
    await verify(rewardDistributorV2.implementation);
  }
};

module.exports.tags = ["RewardDistributorV2"];
