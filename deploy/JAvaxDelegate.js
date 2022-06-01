module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("JAvaxDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JWrappedNativeDelegate",
  });
};

module.exports.tags = ["JAvaxDelegate", "Delegates"];
