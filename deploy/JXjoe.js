const XJOE = new Map();
XJOE.set("43114", "0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33");

const XJOE_PRICE_FEED = new Map();
XJOE_PRICE_FEED.set("43114", "0x02D35d3a8aC3e1626d3eE09A78Dd87286F5E8e3a");

module.exports = async function ({
  getChainId,
  getNamedAccounts,
  deployments,
}) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  if (!XJOE.has(chainId)) {
    throw Error("No XJOE on this chain");
  }

  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract(
    "GovernanceInterestRateModel"
  );

  await deploy("JXjoeDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegate",
  });
  const jXjoeDelegate = await ethers.getContract("JXjoeDelegate");

  const deployment = await deploy("JXjoeDelegator", {
    from: deployer,
    args: [
      XJOE.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Banker Joe XJOE",
      "jXJOE",
      8,
      deployer,
      jXjoeDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jXjoeDelegator = await ethers.getContract("JXjoeDelegator");

  // console.log("Supporting jXJOE market...");
  // await joetroller._supportMarket(jXjoeDelegator.address, 1, {
  //   gasLimit: 2000000,
  // });

  // const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  // console.log("Setting price feed source for jXJOE");
  // await priceOracle._setAggregators(
  //   [jXjoeDelegator.address],
  //   [XJOE_PRICE_FEED.get(chainId)]
  // );

  // const collateralFactor = "0.40";
  // console.log("Setting collateral factor ", collateralFactor);
  // await joetroller._setCollateralFactor(
  //   jXjoeDelegator.address,
  //   ethers.utils.parseEther(collateralFactor)
  // );

  const reserveFactor = "0.40";
  console.log("Setting reserve factor ", reserveFactor);
  await jXjoeDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );
};

module.exports.tags = ["jXJOE"];
// module.exports.dependencies = [
//   "Joetroller",
//   "TripleSlopeRateModel",
//   "PriceOracle",
// ];
