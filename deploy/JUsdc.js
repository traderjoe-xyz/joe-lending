const USDC = new Map();
USDC.set("4", "0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b");
USDC.set("43114", "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664");

const USDC_PRICE_FEED = new Map();
USDC_PRICE_FEED.set("4", "0xa24de01df22b63d23Ebc1882a5E3d4ec0d907bFB");
USDC_PRICE_FEED.set("43114", "0xF096872672F44d6EBA71458D74fe67F9a77a23B9");

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

  const interestRateModel = await ethers.getContract("StableInterestRateModel");

  await deploy("JUsdcDelegate", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegate",
  });
  const jUsdcDelegate = await ethers.getContract("JUsdcDelegate");

  const deployment = await deploy("JUsdcDelegator", {
    from: deployer,
    args: [
      USDC.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 14).toString(),
      "Banker Joe USD coin",
      "jUSDC",
      8,
      deployer,
      jUsdcDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jUsdcDelegator = await ethers.getContract("JUsdcDelegator");

  console.log("Supporting jUSDC market...");
  await joetroller._supportMarket(jUsdcDelegator.address, 1, {
    gasLimit: 2000000,
  });

  const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  console.log("Setting price feed source for jUSDC");
  await priceOracle._setAggregators(
    [jUsdcDelegator.address],
    [USDC_PRICE_FEED.get(chainId)]
  );

  const collateralFactor = "0.80";
  console.log("Setting collateral factor ", collateralFactor);
  await joetroller._setCollateralFactor(
    jUsdcDelegator.address,
    ethers.utils.parseEther(collateralFactor)
  );

  const reserveFactor = "0.15";
  console.log("Setting reserve factor ", reserveFactor);
  await jUsdcDelegator._setReserveFactor(
    ethers.utils.parseEther(reserveFactor)
  );
};

module.exports.tags = ["jUSDC"];
module.exports.dependencies = [
  "Joetroller",
  "TripleSlopeRateModel",
  "PriceOracle",
];
