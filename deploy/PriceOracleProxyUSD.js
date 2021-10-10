module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("PriceOracleProxyUSD", {
    from: deployer,
    args: [deployer],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["PriceOracle"];
