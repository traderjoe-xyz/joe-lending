module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract("TripleSlopeRateModel");

  await deploy("JWrappedNativeDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });
  const cEthDelegate = await ethers.getContract("JWrappedNativeDelegate");

  const deployment = await deploy("JWrappedNativeDelegator", {
    from: deployer,
    args: [
      "0xc778417e063141139fce010982780140aa0cd5ab", // WETH on Rinkeby
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Banker Joe Ether",
      "jETH",
      8,
      deployer,
      cEthDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
  });
  await deployment.receipt;
  const cEthDelegator = await ethers.getContract("JWrappedNativeDelegator");

  console.log("Supporting jETH market...");
  await joetroller._supportMarket(cEthDelegator.address, 2, {
    gasLimit: 4000000,
  });

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
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

module.exports.tags = ["jETH"];
module.exports.dependencies = ["Joetroller", "TripleSlopeRateModel"];
