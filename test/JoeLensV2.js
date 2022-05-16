const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { duration, increase } = require("./utilities/time");

const UNITROLLER_ARTIFACT = require("../deployments/avalanche/Unitroller.json");
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcNativeDelegator.json");
const JUSDC_DELEGATE_ARTIFACT = require("../deployments/avalanche/JUsdcNativeDelegate.json");

const JOE_ADDRESS = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
const USDC_ADDRESS = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";
const MULTISIG_ADDRESS = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
const DEV_ADDRESS = "0xD858eBAa943b4C2fb06BA0Ba8920A132fd2410eE";
const JUSDC_NATIVE_AGGREGATOR_ADDRESS = "0xF096872672F44d6EBA71458D74fe67F9a77a23B9";


describe("JoeLensV2", function () {
  before(async function () {
    // accounts
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];

    // abis
    this.JoeLensCFOld = await ethers.getContractFactory(
      "JoeLens"
    );
    this.JoeLensCFNew = await ethers.getContractFactory(
      "JoeLensV2"
    );
    this.JoetrollerCF = await ethers.getContractFactory("Joetroller");
    this.JoeCF = await ethers.getContractFactory("JErc20");
    this.RewardDistributorCF = await ethers.getContractFactory(
      "RewardDistributorV2"
    );
    this.RewardLensCF = await ethers.getContractFactory("RewardLens")
    this.JUsdcDelegateCF = await ethers.getContractFactory(
      JUSDC_DELEGATE_ARTIFACT.abi,
      JUSDC_DELEGATE_ARTIFACT.bytecode
    );
    this.PriceOracleCF = await ethers.getContractFactory(
      "PriceOracleProxyUSD"
    );

    // Contracts
    this.jUsdcNative = await this.JUsdcDelegateCF.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );
    this.joetroller = await this.JoetrollerCF.attach(
      UNITROLLER_ARTIFACT.address
    );
    this.joe = await this.JoeCF.attach(JOE_ADDRESS);
  });

  beforeEach(async function () {
    // We reset the state before each tests
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
            blockNumber: 12947847,
          },
          live: false,
          saveDeployments: false,
          tags: ["test", "local"],
        },
      ],
    });

    // Impersonate Timelock address, which is the owner of lending contracts
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [MULTISIG_ADDRESS],
    });
    this.admin = await ethers.getSigner(MULTISIG_ADDRESS);

    // Impersonate Dev address
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEV_ADDRESS],
    });
    this.dev = await ethers.getSigner(DEV_ADDRESS);

    // Fund dev with AVAX
    await this.alice.sendTransaction({
      to: this.dev.address,
      value: ethers.utils.parseEther("10"),
    });

    // Deploy rewarder and fund with JOE
    this.rewardDistributor = await upgrades.deployProxy(
      this.RewardDistributorCF,
      []
    );

    await this.joe.connect(this.dev).transfer(
      this.rewardDistributor.address,
      ethers.utils.parseEther("1000000") // 1 million JOE
    );

    await this.rewardDistributor.setAdmin(this.dev.address);

    await this.rewardDistributor.connect(this.dev).setJoe(this.joe.address);
    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributor.address);

    // Deploy Reward Lens for old joe lens and set rewards 
    this.rewardLens = await this.RewardLensCF.deploy();
    await this.rewardLens.deployed(); 

    await this.rewardLens.setMarketRewards(
      this.jUsdcNative.address, 
      ethers.utils.parseEther("0.1"), 
      ethers.utils.parseEther("0.3"), 
      ethers.utils.parseEther("0.1"), 
      ethers.utils.parseEther("0.3")
    );

    // Deploy JoeLens and JoeLensV2 
    this.joeLensOld = await this.JoeLensCFOld.deploy(this.jUsdcNative, this.rewardLens.address);
    this.joeLensNew = await this.JoeLensCFNew.deploy(this.jUsdcNative, this.rewardDistributor.address);
    
    await this.joeLensNew.setAdmin(this.dev.address);

    // Deploy price oracle and set aggregators
    this.priceOracle = await this.PriceOracleCF.deploy(this.dev.address);
    await this.priceOracle.deployed();

    await this.priceOracle
      .connect(this.dev)._setAggregators(
        [this.jUsdcNative.address],
        [JUSDC_NATIVE_AGGREGATOR_ADDRESS]
      );

    await this.joetroller
      .connect(this.admin)
      ._setPriceOracle(this.priceOracle.address);

    this.usdcToken = await ethers.getContractAt("EIP20Interface", USDC_ADDRESS);
    // Approve the spender
    await this.usdcToken
      .connect(this.dev)
      .approve(this.jUsdcNative.address, ethers.utils.parseEther("1000"));

    // mint jusdc
    await this.jUsdcNative
      .connect(this.dev)
      .mint(ethers.utils.parseUnits("1000", 6));
  });

  it("Data returned from jTokenMetadata() is the same as it was from the old JoeLens", async function () {
    const oldMarketData = await this.joeLensOld.callStatic.jTokenMetadata(this.jUsdcNative.address);
    const newMarketData = await this.joeLensNew.callStatic.jTokenMetadata(this.jUsdcNative.address);

    // Minimize returned data to only include fields in the jTokenMetadata struct
    const parsedOldMarketData = Object.fromEntries(
      Object.entries(oldMarketData).slice(26, 44)
    );
    const parsedNewMarketData = Object.fromEntries(
      Object.entries(newMarketData).slice(26, 44)
    );

    expect(JSON.stringify(parsedOldMarketData)).to.be.equal(JSON.stringify(parsedNewMarketData));
  });

  it("Data returned from jTokenMetadataAll() is the as it was from the old JoeLens", async function () {
    const oldMarketData = await this.joeLensOld.callStatic.jTokenMetadataAll([this.jUsdcNative.address]);
    const newMarketData = await this.joeLensNew.callStatic.jTokenMetadataAll([this.jUsdcNative.address]);

    // Minimize returned data to only include fields in the JTokenMetadata struct
    const parsedOldMarketData = Object.fromEntries(
      Object.entries(oldMarketData[0]).slice(26, 44)
    );
    const parsedNewMarketData = Object.fromEntries(
      Object.entries(newMarketData[0]).slice(26, 44)
    );

    expect(JSON.stringify(parsedOldMarketData)).to.be.equal(JSON.stringify(parsedNewMarketData));
  });

  it("getClaimableRewards functions the same as in the old JoeLens ", async function () {
    await this.rewardDistributor
    .connect(this.dev)
    .setRewardSpeed(
      0,
      this.jUsdcNative.address,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("0.3")
    );

    await increase(duration.days(2));

    const oldRewardClaim = await this.joeLensOld.callStatic.getClaimableRewards(0, this.joetroller.address, this.joe.address, this.dev.address);
    const newRewardClaim = await this.joeLensNew.callStatic.getClaimableRewards(0, this.joetroller.address, this.joe.address, this.dev.address);

    expect(oldRewardClaim).to.be.equal(newRewardClaim);
  });

  it("Data returned from jTokenBalances is the same as from the old JoeLens ", async function () {
    const oldBalances = await this.joeLensOld.callStatic.jTokenBalances(this.jUsdcNative.address, this.dev.address);
    const newBalances = await this.joeLensNew.callStatic.jTokenBalances(this.jUsdcNative.address, this.dev.address);

    expect(JSON.stringify(oldBalances)).to.be.equal(JSON.stringify(newBalances));
  });

  it("Data returned from getAccountLimits is the same as from the old JoeLens ", async function () {
    const oldLimits = await this.joeLensOld.callStatic.getAccountLimits(this.joetroller.address, this.dev.address);
    const newLimits = await this.joeLensNew.callStatic.getAccountLimits(this.joetroller.address, this.dev.address);

    expect(JSON.stringify(oldLimits)).to.be.equal(JSON.stringify(newLimits));
  });

  it("setRewardDistributor properly changes the reward distributor address", async function () {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    await this.joeLensNew.connect(this.dev).setRewardDistributor(ZERO_ADDRESS);
    expect(await this.joeLensNew.rewardDistributor()).to.be.equal(ZERO_ADDRESS);
  });

  it("setAdmin properly changes the admin address", async function () {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    await this.joeLensNew.connect(this.dev).setAdmin(ZERO_ADDRESS);
    expect(await this.joeLensNew.admin()).to.be.equal(ZERO_ADDRESS);
  });

  it("Properly retrieves reward speeds from Reward Distributor", async function () {
    await this.rewardDistributor
      .connect(this.dev)
      .setRewardSpeed(
        0,
        this.jUsdcNative.address,
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("0.3")
      );
    
    await this.rewardDistributor
      .connect(this.dev)
      .setRewardSpeed(
        1,
        this.jUsdcNative.address,
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("0.3")
      );

    const oldMarketData = await this.joeLensOld.callStatic.jTokenMetadata(this.jUsdcNative.address);
    const newMarketData = await this.joeLensNew.callStatic.jTokenMetadata(this.jUsdcNative.address);

    expect(oldMarketData.supplyJoeRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.1"));
    expect(oldMarketData.borrowJoeRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.3"));
    expect(oldMarketData.supplyAvaxRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.1"));
    expect(oldMarketData.borrowAvaxRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.3"));

    expect(newMarketData.supplyJoeRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.1"));
    expect(newMarketData.borrowJoeRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.3"));
    expect(newMarketData.supplyAvaxRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.1"));
    expect(newMarketData.borrowAvaxRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.3"));
  });
});
