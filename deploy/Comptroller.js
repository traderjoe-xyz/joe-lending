module.exports = async function({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("Unitroller", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });

  const unitroller = await ethers.getContract("Unitroller");

  await deploy("Comptroller", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });

  const Comptroller = await ethers.getContract("Comptroller");
  console.log("Setting Comptroller as implementation of Unitroller...");
  const deployment = await unitroller._setPendingImplementation(
    Comptroller.address,
    {
      gasLimit: 4000000,
    }
  );
  await deployment.receipt;
  await Comptroller._become(unitroller.address, { gasLimit: 4000000 });
  await deployment.receipt;

  const comptroller = Comptroller.attach(unitroller.address);

  const closeFactor = "0.5";
  console.log("Setting close factor of ", closeFactor);
  await comptroller._setCloseFactor(ethers.utils.parseEther(closeFactor));

  const liquidationIncentive = "1.08";
  console.log("Setting liquidation incentive of ", liquidationIncentive);
  await comptroller._setLiquidationIncentive(
    ethers.utils.parseEther(liquidationIncentive)
  );

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price oracle ", priceOracle.address);
  await comptroller._setPriceOracle(priceOracle.address);
};

module.exports.tags = ["Comptroller"];
module.exports.dependencies = ["Oracle"];
