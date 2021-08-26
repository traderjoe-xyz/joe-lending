module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer, dev, treasury } = await getNamedAccounts();
  const Comptroller = await ethers.getContract("Comptroller");
  const unitroller = await ethers.getContract("Unitroller");
  const comptroller = Comptroller.attach(unitroller.address);

  await deploy("CUsdcDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "CErc20Delegate",
  });

  const cUsdcDelegate = await ethers.getContract("CUsdcDelegate");

  const interestRateModel = await ethers.getContract("TripleSlopeRateModel");

  const deployment = await deploy("CUsdcDelegator", {
    from: deployer,
    args: [
      "0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b", // USDC address on Rinkeby
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 14).toString(),
      "Compound USDC Token",
      "cUSDC",
      "8",
      deployer,
      cUsdcDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "CErc20Delegator",
    gasLimit: 4000000,
  });
  await deployment.receipt;
  const cUsdcDelegator = await ethers.getContract("CUsdcDelegator");

  console.log("Supporting cUSDC market...");
  await comptroller._supportMarket(cUsdcDelegator.address, 0, {
    gasLimit: 4000000,
  });

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await comptroller._setCollateralFactor(
    cUsdcDelegator.address,
    ethers.utils.parseEther(collateralFactor),
    { gasLimit: 4000000 }
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await cUsdcDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );
};

module.exports.tags = ["cUSDC"];
// module.exports.dependencies = ["Comptroller", "TripleSlopeRateModel"];
