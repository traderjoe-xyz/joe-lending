module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer, dev, treasury } = await getNamedAccounts();
  const Comptroller = await ethers.getContract("Comptroller");
  const unitroller = await ethers.getContract("Unitroller");
  const comptroller = Comptroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract("TripleSlopeRateModel");

  await deploy("CWrappedNativeDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });
  const cEthDelegate = await ethers.getContract("CWrappedNativeDelegate");

  const deployment = await deploy("CWrappedNativeDelegator", {
    from: deployer,
    args: [
      "0xc778417e063141139fce010982780140aa0cd5ab", // WETH on Rinkeby
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Wrapped Ether",
      "WETH",
      18,
      deployer,
      cEthDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
  });
  await deployment.receipt;
  const cEthDelegator = await ethers.getContract("CUsdcDelegator");

  console.log("Supporting cETH market...");
  await comptroller._supportMarket(cEthDelegator.address, 2, {
    gasLimit: 4000000,
  });

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await comptroller._setCollateralFactor(
    cEthDelegator.address,
    ethers.utils.parseEther(collateralFactor),
    {
      gasLimit: 4000000,
    }
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await cEthDelegator._setReserveFactor(ethers.utils.parseEther(reserveFactor));
};

module.exports.tags = ["cETH"];
// module.exports.dependencies = ["Comptroller", "TripleSlopeRateModel"];
