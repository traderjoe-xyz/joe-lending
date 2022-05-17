const { verify } = require("../utils/index")

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const rewardDistributor = await deployments.get("RewardDistributorV2");

  const joeLensV2 = await deploy("JoeLensV2", {
    from: deployer,
    args: ["jAVAX", rewardDistributor.address],
    log: true,
    deterministicDeployment: false,
  });

  if (joeLensV2.newlyDeployed) {
    await verify(joeLensV2, ["jAVAX", rewardDistributor.address])
  }
};


module.exports.tags = ["JoeLensV2"];
module.exports.dependencies = ["RewardDistributorV2"]
