module.exports = async function({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer, dev, treasury } = await getNamedAccounts();
  const Comptroller = await ethers.getContract("Comptroller");
  const unitroller = await ethers.getContract("Unitroller");
  const comptroller = Comptroller.attach(unitroller.address);

  await deploy("CDaiDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "CErc20Delegate",
  });

  const cDaiDelegate = await ethers.getContract("CDaiDelegate");

  const interestRateModel = await ethers.getContract("TripleSlopeRateModel");

  await deploy("CDaiDelegator", {
    from: deployer,
    args: [
      "0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea", // DAI address on Rinkeby
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Compound DAI Token",
      "cDAI",
      "8",
      deployer,
      cDaiDelegate.address,
      "0x00",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "CErc20Delegator",
  });
  const cDaiDelegator = await ethers.getContract("CDaiDelegator");

  console.log("Supporting cDAI market...");
  await comptroller._supportMarket(cDaiDelegator.address, 0);

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await comptroller._setCollateralFactor(
    cDaiDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await cDaiDelegator._setReserveFactor(ethers.utils.parseEther(reserveFactor));
};

module.exports.tags = ["cDAI"];
module.exports.dependencies = ["Comptroller", "TripleSlopeRateModel"];
