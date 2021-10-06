module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const jAvax = await ethers.getContract("JWrappedNativeDelegator");

  await deploy("Maximillion", {
    from: deployer,
    args: [jAvax.address],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["Max"];
