module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  await deploy("JDaiDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JErc20Delegate",
  });

  const cDaiDelegate = await ethers.getContract("JDaiDelegate");

  const interestRateModel = await ethers.getContract("TripleSlopeRateModel");

  await deploy("JDaiDelegator", {
    from: deployer,
    args: [
      "0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea", // DAI address on Rinkeby
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Banker Joe DAI Token",
      "jDAI",
      "8",
      deployer,
      cDaiDelegate.address,
      "0x00",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JErc20Delegator",
  });
  const cDaiDelegator = await ethers.getContract("JDaiDelegator");

  console.log("Supporting jDAI market...");
  await joetroller._supportMarket(cDaiDelegator.address, 0);

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    cDaiDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await cDaiDelegator._setReserveFactor(ethers.utils.parseEther(reserveFactor));
};

module.exports.tags = ["jDAI"];
module.exports.dependencies = ["Joetroller", "TripleSlopeRateModel"];
