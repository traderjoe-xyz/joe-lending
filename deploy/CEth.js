module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer, dev, treasury } = await getNamedAccounts();
  const Comptroller = await ethers.getContract("Comptroller");
  const unitroller = await ethers.getContract("Unitroller");
  const comptroller = Comptroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract("TripleSlopeRateModel");

  await deploy("CEther", {
    from: deployer,
    args: [
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Compound Ether Token",
      "cEther",
      "8",
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
    none: 2,
  });
  const cEth = await ethers.getContract("CEther");

  console.log("Supporting cETH market...");
  await comptroller._supportMarket(cEth.address, 2);

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await comptroller._setCollateralFactor(
    cEth.address,
    ethers.utils.parseEther(collateralFactor)
  );
};

module.exports.tags = ["cETH"];
// module.exports.dependencies = ["Comptroller", "TripleSlopeRateModel"];
