module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("JoeLensView", {
    from: deployer,
    args: ["jETH"],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["JoeLensView"];
