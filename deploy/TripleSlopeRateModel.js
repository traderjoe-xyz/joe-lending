module.exports = async function({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("TripleSlopeRateModel", {
    from: deployer,
    args: [
      "0",
      "144000000000000000",
      "8000000000000000000",
      "800000000000000000",
      "900000000000000000",
      "1500000000000000000",
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
    gasLimit: 4000000,
  });
};

module.exports.tags = ["TripleSlopeRateModel"];
