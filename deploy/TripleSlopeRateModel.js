module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // For Majors like WBTC, WETH, AVAX
  await deploy("MajorInterestRateModel", {
    from: deployer,
    args: [
      "0", // Base 0%
      "200000000000000000", // Multiplier 20%
      "2000000000000000000", // Jump multiplier 200%
      "800000000000000000", // Kink1 80%
      "900000000000000000", // Kink2 90%
      "1500000000000000000", // Roof 150%
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
    contract: "TripleSlopeRateModel",
  });

  // For Stablecoins like USDT, USDC, DAI
  await deploy("StableInterestRateModel", {
    from: deployer,
    args: [
      "0", // Base 0%
      "130000000000000000", // Mulitplier 13%
      "8000000000000000000", // Jump multiplier 800%
      "800000000000000000", // Kink1 80%
      "900000000000000000", // Kink2 90%
      "1500000000000000000", // Roof 150%
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
    contract: "TripleSlopeRateModel",
  });

  // For all other coins, mainly governance coins
  await deploy("GovernanceInterestRateModel", {
    from: deployer,
    args: [
      "0", // Base 0%
      "250000000000000000", // Mulitplier 25%
      "10000000000000000000", // Jump multiplier 1000%
      "800000000000000000", // Kink1 80%
      "900000000000000000", // Kink2 90%
      "1500000000000000000", // Roof 150%
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
    contract: "TripleSlopeRateModel",
  });
};

module.exports.tags = ["TripleSlopeRateModel"];
