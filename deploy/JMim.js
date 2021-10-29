const MIM = new Map();
MIM.set("43114", "0x130966628846bfd36ff31a822705796e8cb8c18d");

const MIM_PRICE_FEED = new Map();
MIM_PRICE_FEED.set("43114", "0x54EdAB30a7134A16a54218AE64C73e1DAf48a8Fb");

module.exports = async function ({
  getChainId,
  getNamedAccounts,
  deployments,
}) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  if (!MIM.has(chainId)) {
    throw Error("No MIM on this chain");
  }

  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract("StableInterestRateModel");

  await deploy("JMimDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegate",
  });
  const jMimDelegate = await ethers.getContract("JMimDelegate");

  const deployment = await deploy("JMimDelegator", {
    from: deployer,
    args: [
      MIM.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Banker Joe MIM",
      "jMIM",
      8,
      deployer,
      jMimDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jMimDelegator = await ethers.getContract("JMimDelegator");

  console.log("Supporting jMIM market...");
  await joetroller._supportMarket(jMimDelegator.address, 1, {
    gasLimit: 2000000,
  });

  // const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  // console.log("Setting price feed source for jMIM");
  // await priceOracle._setAggregators(
  //   [jMimDelegator.address],
  //   [MIM_PRICE_FEED.get(chainId)]
  // );

  const collateralFactor = "0.60";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    jMimDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  // const reserveFactor = "0.25";
  // console.log("Setting reserve factor ", reserveFactor);
  // await jMimDelegator._setReserveFactor(ethers.utils.parseEther(reserveFactor));
};

module.exports.tags = ["jMIM"];
// module.exports.dependencies = [
//   "Joetroller",
//   "TripleSlopeRateModel",
//   "PriceOracle",
// ];
