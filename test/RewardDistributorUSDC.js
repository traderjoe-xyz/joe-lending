const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { duration, increase } = require("./utilities/time");

const UNITROLLER_ARTIFACT = require("../deployments/avalanche/Unitroller.json");
const JOELENS_ARTIFACT = require("../deployments/avalanche/JoeLens.json");
const OLD_REWARD_DISTRIBUTOR_ARTIFACT = require("../deployments/avalanche/versions/RewardDistributorV3.json");
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcNativeDelegator.json");
const JUSDC_DELEGATE_ARTIFACT = require("../deployments/avalanche/JUsdcNativeDelegate.json");

const MULTISIG_ADDRESS = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
const DEV_ADDRESS = "0xD858eBAa943b4C2fb06BA0Ba8920A132fd2410eE";
const JOE_ADDRESS = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
const USDC_ADDRESS = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";

let rewardedJoe;

describe("RewardDistributor", function () {
  before(async function () {
    // Accounts
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];

    // ABIs
    this.JUsdcDelegateCF = await ethers.getContractFactory(
      JUSDC_DELEGATE_ARTIFACT.abi,
      JUSDC_DELEGATE_ARTIFACT.bytecode
    );
    this.JoetrollerCF = await ethers.getContractFactory("Joetroller");
    this.JoeLensCF = await ethers.getContractFactory("JoeLens");
    this.RewardDistributorCFOld = await ethers.getContractFactory(
      OLD_REWARD_DISTRIBUTOR_ARTIFACT.abi,
      OLD_REWARD_DISTRIBUTOR_ARTIFACT.bytecode
    );
    this.RewardDistributorCFNew = await ethers.getContractFactory(
      "RewardDistributor"
    );
    this.JoeCF = await ethers.getContractFactory("JErc20");

    // Contracts
    this.jUsdcNative = await this.JUsdcDelegateCF.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );
    this.joetroller = await this.JoetrollerCF.attach(
      UNITROLLER_ARTIFACT.address
    );
    this.joeLens = await this.JoeLensCF.attach(JOELENS_ARTIFACT.address);
    this.rewardDistributorOld = await this.RewardDistributorCFOld.attach(
      OLD_REWARD_DISTRIBUTOR_ARTIFACT.address
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
    // Fund admin with AVAX
    await this.alice.sendTransaction({
      to: this.admin.address,
      value: ethers.utils.parseEther("10"),
    });

    // Impersonate Dev address, which is the owner of old RewardDistributor
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

    // Deploy new rewarder and fund with JOE
    this.rewardDistributorNew = await this.RewardDistributorCFNew.connect(
      this.dev
    ).deploy(this.rewardDistributorOld.address);

    await this.joe.connect(this.dev).transfer(
      this.rewardDistributorNew.address,
      ethers.utils.parseEther("1000000") // 1 million JOE
    );

    // We stop emission to the old rewarder
    const jTokens = await this.joetroller.getAllMarkets();
    for (let i = 0; i < jTokens.length; i++) {
      await this.rewardDistributorOld
        .connect(this.admin)
        ._setRewardSpeed(0, jTokens[i], "0", "0");
    }

    await this.rewardDistributorNew
      .connect(this.dev)
      .setJoeAddress(this.joe.address);
    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributorNew.address);

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

  it("reverts when minting if reward rate < 1*10**11", async function () {
    await this.rewardDistributorNew
      .connect(this.dev)
      ._setRewardSpeed(0, this.jUsdcNative.address, String(1 * 10 ** 10), 0);
    await expect(
      this.jUsdcNative.connect(this.dev).mint(1 * 10 ** 6)
    ).to.be.revertedWith("subtraction underflow");
  });

  it("accrues reward if reward rate > 1*10**15", async function () {
    rewardedJoe = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, this.dev.address);

    await this.rewardDistributorNew
      .connect(this.dev)
      ._setRewardSpeed(0, this.jUsdcNative.address, String(1 * 10 ** 16), 0);

    expect(
      await this.joeLens.callStatic[
        "getClaimableRewards(uint8,address,address,address)"
      ](0, this.joetroller.address, this.joe.address, this.dev.address)
    ).to.be.equal(rewardedJoe);
  });

  it("only accrues rewards from when rewards enabled", async function () {
    await increase(duration.days(30));

    // From here is the same as the above test.
    await this.rewardDistributorNew
      .connect(this.dev)
      ._setRewardSpeed(0, this.jUsdcNative.address, String(1 * 10 ** 16), 0);

    expect(
      await this.joeLens.callStatic[
        "getClaimableRewards(uint8,address,address,address)"
      ](0, this.joetroller.address, this.joe.address, this.dev.address)
    ).to.be.equal(rewardedJoe);

    await increase(duration.days(1));

    expect(
      await this.joeLens.callStatic[
        "getClaimableRewards(uint8,address,address,address)"
      ](0, this.joetroller.address, this.joe.address, this.dev.address)
    ).to.be.above(rewardedJoe);
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
