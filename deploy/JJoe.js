const JOE = new Map();
JOE.set("43114", "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd");

const JOE_PRICE_FEED = new Map();
JOE_PRICE_FEED.set("43114", "0x02D35d3a8aC3e1626d3eE09A78Dd87286F5E8e3a");

module.exports = async function ({
  getChainId,
  getNamedAccounts,
  deployments,
}) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  if (!JOE.has(chainId)) {
    throw Error("No JOE on this chain");
  }

  const Joetroller = await ethers.getContract("Joetroller");
  const unitroller = await ethers.getContract("Unitroller");
  const joetroller = Joetroller.attach(unitroller.address);

  const interestRateModel = await ethers.getContract(
    "GovernanceInterestRateModel"
  );

  const jJoeDelegate = await ethers.getContract("JCollateralCapErc20Delegate");

  const deployment = await deploy("JJoeDelegator", {
    from: deployer,
    args: [
      JOE.get(chainId),
      joetroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("2", 26).toString(),
      "Banker Joe JOE",
      "jJOE",
      8,
      deployer,
      jJoeDelegate.address,
      "0x",
    ],
    log: true,
    deterministicDeployment: false,
    contract: "JCollateralCapErc20Delegator",
  });
  await deployment.receipt;
  const jJoeDelegator = await ethers.getContract("JJoeDelegator");

  // if (deployent.newlyDeployed) {
  //   const priceOracle = await ethers.getContract("PriceOracleProxyUSD");
  //   console.log("Setting price feed source for jJOE");
  //   await priceOracle._setAggregators(
  //     [jJoeDelegator.address],
  //     [JOE_PRICE_FEED.get(chainId)]
  //   );

  //   console.log("Supporting jJOE market...");
  //   await joetroller._supportMarket(jJoeDelegator.address, 1);

  //   const collateralFactor = "0.40";
  //   console.log("Setting collateral factor ", collateralFactor);
  //   await joetroller._setCollateralFactor(
  //     jJoeDelegator.address,
  //     ethers.utils.parseEther(collateralFactor)
  //   );

  //   const reserveFactor = "0.40";
  //   console.log("Setting reserve factor ", reserveFactor);
  //   await jJoeDelegator._setReserveFactor(
  //     ethers.utils.parseEther(reserveFactor)
  //   );
  // }
};

module.exports.tags = ["jJOE"];
module.exports.dependencies = [
  "Joetroller",
  "TripleSlopeRateModel",
  "PriceOracle",
];
module.exports.skip = async () => {
  const chainId = await getChainId();
  if (!JOE.has(chainId)) {
    console.log("JOE address missing");
    return true;
  }
};
