const { ethers, network } = require("hardhat");
const { expect } = require("chai");

const UNITROLLER_ARTIFACT = require("../deployments/avalanche/Unitroller.json");
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcNativeDelegator.json");
const JUSDC_DELEGATE_ARTIFACT = require("../deployments/avalanche/JUsdcNativeDelegate.json");

const JOE_ADDRESS = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
const MULTISIG_ADDRESS = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
const DEV_ADDRESS = "0xD858eBAa943b4C2fb06BA0Ba8920A132fd2410eE";
const JUSDC_NATIVE_AGGREGATOR_ADDRESS = "0xF096872672F44d6EBA71458D74fe67F9a77a23B9";

describe("JoeLensV2", function () {
  before(async function () {
    // accounts
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];

    // abis
    this.JoeLensCF = await ethers.getContractFactory(
      "JoeLensV2"
    );
    this.JoetrollerCF = await ethers.getContractFactory("Joetroller");
    this.JoeCF = await ethers.getContractFactory("JErc20");
    this.RewardDistributorCF = await ethers.getContractFactory(
      "RewardDistributorV2"
    );
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

    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributor.address);

    // Deploy JoeLensV2 
    this.joeLens = await this.JoeLensCF.deploy(this.jUsdcNative, this.rewardDistributor.address)
  
    // Deploy price oracle and set aggregators
    this.priceOracle = await this.PriceOracleCF.deploy(this.dev.address);
    await this.priceOracle.deployed();

    await this.priceOracle
      .connect(this.dev)._setAggregators(
        [this.jUsdcNative.address],
        [JUSDC_NATIVE_AGGREGATOR_ADDRESS]
      )

    await this.joetroller
      .connect(this.admin)
      ._setPriceOracle(this.priceOracle.address);
  });

  it("should properly get reward speeds from RewardDistributor to add to JTokenMetadata response", async function () {
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
    const market = await this.joeLens.callStatic.jTokenMetadata(this.jUsdcNative.address);

    expect(market.supplyJoeRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.1"))
    expect(market.borrowJoeRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.3"))
    expect(market.supplyAvaxRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.1"))
    expect(market.borrowAvaxRewardsPerSecond).to.be.equal(ethers.utils.parseEther("0.3"))
  });
});
