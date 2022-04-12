const { ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { duration, increase } = require("./utilities/time");

const UNITROLLER_ARTIFACT = require("../deployments/avalanche/Unitroller.json");
const JOELENS_ARTIFACT = require("../deployments/avalanche/JoeLens.json");
const REWARD_DISTRIBUTOR_ARTIFACT_V1 = require("../deployments/avalanche/versions/RewardDistributorV1.json");
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcDelegator.json");
const JUSDC_DELEGATE_ARTIFACT = require("../deployments/avalanche/JUsdcDelegate.json");

const TIMELOCK_ADDRESS = "0x243cc1760F0b96c533C11656491e7EBB9663Bf33";
const DEV_ADDRESS = "0x66Fb02746d72bC640643FdBa3aEFE9C126f0AA4f";
const USDC_LENDER = "0xc5ed2333f8a2c351fca35e5ebadb2a82f5d254c3";
const JOE_ADDRESS = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";

describe.only("RewardDistributor", function () {
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
      REWARD_DISTRIBUTOR_ARTIFACT_V1.abi,
      REWARD_DISTRIBUTOR_ARTIFACT_V1.bytecode
    );
    this.RewardDistributorCFNew = await ethers.getContractFactory(
      "RewardDistributor",
      this.dev
    );
    this.JoeCF = await ethers.getContractFactory("JErc20");

    // Contracts
    this.jUsdc = await this.JUsdcDelegateCF.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );
    this.joetroller = await this.JoetrollerCF.attach(
      UNITROLLER_ARTIFACT.address
    );
    this.joeLens = await this.JoeLensCF.attach(JOELENS_ARTIFACT.address);
    this.rewardDistributorOld = await this.RewardDistributorCFOld.attach(
      REWARD_DISTRIBUTOR_ARTIFACT_V1.address
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
            blockNumber: 7177420,
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
      params: [TIMELOCK_ADDRESS],
    });
    this.admin = await ethers.getSigner(TIMELOCK_ADDRESS);
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
    this.rewardDistributorNew = await upgrades.deployProxy(
      this.RewardDistributorCFNew,
      []
    );

    await this.rewardDistributorNew.setAdmin(this.dev.address);

    await this.joe.connect(this.dev).transfer(
      this.rewardDistributorNew.address,
      ethers.utils.parseEther("1000") // 1 million JOE
    );
  });

  it.only("automatically accrues rewards for current lenders after upgrade", async function () {
    // Get USDC lender who has accrued rewards from V1
    const rewardsBefore = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsBefore).to.be.gt("0");
    // Upgrade RewardDistributor from V1 to V2
    await this.rewardDistributorNew.connect(this.dev).setJoe(this.joe.address);

    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributorNew.address);
    await this.rewardDistributorNew
      .connect(this.dev)
      .setJoe(this.joe.address);
    await this.rewardDistributorNew
      .connect(this.dev)
      .setRewardSpeed(0, this.jUsdc.address, "10", "10");

    // Expect rewards to be zeroed out since new rewarder resets state
    const rewardsAtT0 = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAtT0).to.equal("0");

    // Set reward speeds for JOE for jUSDC market
    await this.rewardDistributorNew
      .connect(this.dev)
      .setRewardSpeed(
        0,
        this.jUsdc.address,
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("0.1")
      );

    // Fast forward 10 seconds
    await increase(duration.seconds(10));

    // Assert USDC lender has accrued rewards for supplying for 10 seconds
    const rewardsAtT10 = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAtT10).to.be.gt("0");

    // Fast forward 10 days
    await increase(duration.days(10));

    // Assert USDC lender has accrued rewards for supplying for 10 days
    const rewardsAtD10 = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAtD10).to.be.gt(rewardsAtT10);
  });

  it("can still claim rewards from old reward distributor contract", async function () {
    // Get USDC lender who has accrued rewards from V1
    const rewardsBefore = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsBefore).to.be.gt("0");

    await this.rewardDistributorNew.connect(this.dev).setJoe(this.joe.address);
    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributorNew.address);
    await this.rewardDistributorNew
      .connect(this.dev)
      .setJoeAddress(this.joe.address);
    await this.rewardDistributorNew
      .connect(this.dev)
      ._setRewardSpeed(0, this.jUsdc.address, "10", "10");

    // Expect new rewards to be zeroed out since new rewarder resets state
    const newRewardsAtT0 = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(newRewardsAtT0).to.equal("0");

    // Expect old rewards to still be claimable
    const balBefore = await this.joe.balanceOf(USDC_LENDER);
    await this.rewardDistributorOld["claimReward(uint8,address)"](
      0,
      USDC_LENDER
    );
    const balAfter = await this.joe.balanceOf(USDC_LENDER);
    const balDelta = balAfter.sub(balBefore);

    // Assert it's greater here because some seconds have passed since
    expect(balDelta).to.be.gt(rewardsBefore);
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
