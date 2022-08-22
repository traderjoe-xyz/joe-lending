const BTC = new Map();
BTC.set("43113", "0xC95cf3C9362e99267e4FA95D44626Fd92b93243D");
BTC.set("43114", "0x152b9d0FdC40C096757F570A51E494bd4b943E50");

const BTC_PRICE_FEED = new Map();
BTC_PRICE_FEED.set("43113", "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a");
BTC_PRICE_FEED.set("43114", "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743");

const MULTI_SIG = new Map();
MULTI_SIG.set("43113", "0xdB40a7b71642FE24CC546bdF4749Aa3c0B042f78");
MULTI_SIG.set("43114", "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad");

module.exports = async function ({
  getChainId,
  getNamedAccounts,
  deployments,
}) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract("MajorInterestRateModel");

  const jBtcDelegate = await ethers.getContract("JCollateralCapErc20Delegate");

  const deployment = await deploy("JBtcDelegator", {
    from: deployer,
    args: [
      BTC.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 16).toString(),
      "Banker Joe Bitcoin",
      "jBTC",
      8,
      MULTI_SIG.get(chainId),
      jBtcDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jBtcDelegator = await ethers.getContract("JBtcDelegator");

  console.log("Supporting jBTC market...");
  // await joetroller._supportMarket(jBtcDelegator.address, 1, {
  //   gasLimit: 2000000,
  // });

  console.log(
    joetroller.address,
    joetroller.interface.encodeFunctionData("_supportMarket", [
      jBtcDelegator.address,
      1,
    ])
  );

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price feed source for jBTC");
  // await priceOracle._setAggregators(
  //   [jBtcDelegator.address],
  //   [BTC_PRICE_FEED.get(chainId)]
  // );

  console.log(
    priceOracle.address,
    priceOracle.interface.encodeFunctionData("_setAggregators", [
      [jBtcDelegator.address],
      [BTC_PRICE_FEED.get(chainId)],
    ])
  );

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  // await joetroller._setCollateralFactor(
  //   jBtcDelegator.address,
  //   ethers.utils.parseEther(collateralFactor)
  // );

  console.log(
    joetroller.address,
    joetroller.interface.encodeFunctionData("_setCollateralFactor", [
      jBtcDelegator.address,
      ethers.utils.parseEther(collateralFactor),
    ])
  );

  const reserveFactor = "0.25";
  console.log("Setting reserve factor ", reserveFactor);
  // await jBtcDelegator._setReserveFactor(ethers.utils.parseEther(reserveFactor));

  console.log(
    jBtcDelegator.address,
    jBtcDelegate.interface.encodeFunctionData("_setReserveFactor", [
      ethers.utils.parseEther(reserveFactor),
    ])
  );

  const protocolSeizeShare = "0.016";
  console.log("Setting protocol seize share ", protocolSeizeShare);
  // await jBtcDelegator._setProtocolSeizeShare(
  //   ethers.utils.parseEther(protocolSeizeShare)
  // );

  console.log(
    jBtcDelegator.address,
    jBtcDelegate.interface.encodeFunctionData("_setProtocolSeizeShare", [
      ethers.utils.parseEther(protocolSeizeShare),
    ])
  );
};

module.exports.tags = ["jBTC"];
// module.exports.dependencies = [
//   "Joetroller",
//   "TripleSlopeRateModel",
//   "PriceOracle",
//   "JCollateralCapErc20Delegate",
// ];
module.exports.skip = async () => {
  const chainId = await getChainId();
  if (!BTC.has(chainId)) {
    console.log("BTC address missing");
    return true;
  }
};
