const USDT = new Map();
USDT.set("43114", "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7");
USDT.set("43113", "0xafabd03bdd641f6a6dd22a6661267fd9b64bf6a3");

const USDT_PRICE_FEED = new Map();
USDT_PRICE_FEED.set("43114", "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a");
USDT_PRICE_FEED.set("43113", "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad");

module.exports = async function ({
  getChainId,
  getNamedAccounts,
  deployments,
}) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  if (!USDT.has(chainId)) {
    throw Error("No USDT on this chain");
  }

  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract("StableInterestRateModel");

  const jUsdtNativeDelegate = await ethers.getContract(
    "JCollateralCapErc20Delegate"
  );

  const deployment = await deploy("JUsdtNativeDelegator", {
    from: deployer,
    args: [
      USDT.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 14).toString(),
      "Banker Joe USD Tether (Native)",
      "jUSDTNative",
      8,
      deployer,
      jUsdtNativeDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jUsdtNativeDelegator = await ethers.getContract("JUsdtNativeDelegator");

  console.log("Supporting jUSDT market...");
  await joetroller._supportMarket(jUsdtNativeDelegator.address, 1, {
    gasLimit: 2000000,
  });

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price feed source for jUSDTNative");
  await priceOracle._setAggregators(
    [jUsdtNativeDelegator.address],
    [USDT_PRICE_FEED.get(chainId)]
  );

  const collateralFactor = "0.80";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    jUsdtNativeDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await jUsdtNativeDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );

  const protocolSeizeShare = "0.016";
  console.log("Setting protocol seize share ", protocolSeizeShare);
  await jUsdtNativeDelegator._setProtocolSeizeShare(
    ethers.utils.parseEther(protocolSeizeShare)
  );
};

module.exports.tags = ["jUSDTNative"];
module.exports.dependencies = [
  "Joetroller",
  "TripleSlopeRateModel",
  "PriceOracle",
  "JCollateralCapErc20Delegate",
];
module.exports.skip = async () => {
  const chainId = await getChainId();
  if (!USDT.has(chainId)) {
    console.log("USDT address missing");
    return true;
  }
};
