const WETH = new Map();
WETH.set("4", "0xc778417e063141139fce010982780140aa0cd5ab");
WETH.set("43114", "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab");
WETH.set("43113", "0x1886D09C9Ade0c5DB822D85D21678Db67B6c2982");

const ETH_PRICE_FEED = new Map();
ETH_PRICE_FEED.set("4", "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e");
ETH_PRICE_FEED.set("43114", "0x976B3D034E162d8bD72D6b9C989d545b839003b0");
ETH_PRICE_FEED.set("43113", "0x86d67c3D38D2bCeE722E601025C25a575021c6EA");

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

  const jWethDelegate = await ethers.getContract("JERC20Delegate");

  const deployment = await deploy("JWethDelegator", {
    from: deployer,
    args: [
      WETH.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Banker Joe Wrapped Ether",
      "jWETH",
      8,
      deployer,
      jWethDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jWethDelegator = await ethers.getContract("JWethDelegator");

  console.log("Supporting jWETH market...");
  await joetroller._supportMarket(jWethDelegator.address, 1, {
    gasLimit: 2000000,
  });

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price feed source for jWETH");
  await priceOracle._setAggregators(
    [jWethDelegator.address],
    [ETH_PRICE_FEED.get(chainId)]
  );

  const collateralFactor = "0.75";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    jWethDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.20";
  console.log("Setting reserve factor ", reserveFactor);
  await jWethDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );
};

module.exports.tags = ["jWETH"];
module.exports.dependencies = [
  "Joetroller",
  "TripleSlopeRateModel",
  "PriceOracle",
  "JERC20Delegate",
];
