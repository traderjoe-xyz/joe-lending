module.exports = async function({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("V1PriceOracle", {
    from: deployer,
    args: [deployer],
    log: true,
    deterministicDeployment: false,
    gasLimit: 4000000,
  });

  const v1PriceOracle = await ethers.getContract("V1PriceOracle");

  await deploy("PriceOracleProxyUSD", {
    from: deployer,
    args: [
      deployer,
      v1PriceOracle.address,
      "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e", // ETH-USD aggregator on Rinkeby
    ],
    log: true,
    deterministicDeployment: false,
    gasLimit: 4000000,
  });
};

module.exports.tags = ["Oracle"];
