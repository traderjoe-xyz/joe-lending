const USDT = new Map();
USDT.set("43114", "0xc7198437980c041c805a1edcba50c1ce5db95118");

const USDT_PRICE_FEED = new Map();
USDT_PRICE_FEED.set("43114", "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a");

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

  await deploy("JUsdtDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegate",
  });
  const jUsdtDelegate = await ethers.getContract("JUsdtDelegate");

  const deployment = await deploy("JUsdtDelegator", {
    from: deployer,
    args: [
      USDT.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 14).toString(),
      "Banker Joe USD Tether",
      "jUSDT",
      8,
      deployer,
      jUsdtDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jUsdtDelegator = await ethers.getContract("JUsdtDelegator");

  console.log("Supporting jUSDT market...");
  await joetroller._supportMarket(jUsdtDelegator.address, 1, {
    gasLimit: 2000000,
  });

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price feed source for jUSDT");
  await priceOracle._setAggregators(
    [jUsdtDelegator.address],
    [USDT_PRICE_FEED.get(chainId)]
  );

  const collateralFactor = "0.80";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    jUsdtDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.15";
  console.log("Setting reserve factor ", reserveFactor);
  await jUsdtDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );
};

module.exports.tags = ["jUSDT"];
module.exports.dependencies = [
  "Joetroller",
  "TripleSlopeRateModel",
  "PriceOracle",
];
