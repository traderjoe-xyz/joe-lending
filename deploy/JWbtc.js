const WBTC = new Map();
WBTC.set("4", "0x577D296678535e4903D59A4C929B718e1D575e0A");
WBTC.set("43114", "0x50b7545627a5162f82a992c33b87adc75187b218");

const BTC_PRICE_FEED = new Map();
BTC_PRICE_FEED.set("4", "0xECe365B379E1dD183B20fc5f022230C044d51404");
BTC_PRICE_FEED.set("43114", "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743");

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

  await deploy("JWbtcDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegate",
  });
  const jWbtcDelegate = await ethers.getContract("JWbtcDelegate");

  const deployment = await deploy("JWbtcDelegator", {
    from: deployer,
    args: [
      WBTC.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 16).toString(),
      "Banker Joe Wrapped Bitcoin",
      "jWBTC",
      8,
      deployer,
      jWbtcDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jWbtcDelegator = await ethers.getContract("JWbtcDelegator");

  console.log("Supporting jWBTC market...");
  await joetroller._supportMarket(jWbtcDelegator.address, 1, {
    gasLimit: 2000000,
  });

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price feed source for jWBTC");
  await priceOracle._setAggregators(
    [jWbtcDelegator.address],
    [BTC_PRICE_FEED.get(chainId)]
  );

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    jWbtcDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await jWbtcDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );
};

module.exports.tags = ["jWBTC"];
module.exports.dependencies = [
  "Joetroller",
  "TripleSlopeRateModel",
  "PriceOracle",
];
