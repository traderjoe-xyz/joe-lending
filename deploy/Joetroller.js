module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("RewardDistributor", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });

  await deploy("Unitroller", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });

  const unitroller = await ethers.getContract("Unitroller");

  await deploy("Joetroller", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });

  const Joetroller = await ethers.getContract("Joetroller");
  console.log("Setting Joetroller as implementation of Unitroller...");
  const deployment = await unitroller._setPendingImplementation(
    Joetroller.address,
    {
      gasLimit: 4000000,
    }
  );
  await deployment.receipt;
  await Joetroller._become(unitroller.address, { gasLimit: 4000000 });
  await deployment.receipt;

  const joetroller = Joetroller.attach(unitroller.address);

  const closeFactor = "0.5";
  console.log("Setting close factor of ", closeFactor);
  await joetroller._setCloseFactor(ethers.utils.parseEther(closeFactor));

  const liquidationIncentive = "1.08";
  console.log("Setting liquidation incentive of ", liquidationIncentive);
  await joetroller._setLiquidationIncentive(
    ethers.utils.parseEther(liquidationIncentive)
  );

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price oracle ", priceOracle.address);
  await joetroller._setPriceOracle(priceOracle.address);

  const rewardDistributor = await ethers.getContract("RewardDistributor");
  console.log("Setting reward distributor", rewardDistributor.address);
  await joetroller._setRewardDistributor(rewardDistributor.address, {
    gasLimit: 4000000,
  });
};

module.exports.tags = ["Joetroller"];
module.exports.dependencies = ["Oracle"];
