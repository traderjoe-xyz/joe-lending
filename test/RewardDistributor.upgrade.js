const { ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { duration, increase } = require("./utilities/time");

const UNITROLLER_ARTIFACT = require("../deployments/avalanche/Unitroller.json");
const JOELENS_ARTIFACT = require("../deployments/avalanche/JoeLens.json");
const OLD_REWARD_DISTRIBUTOR_ARTIFACT = require("../deployments/avalanche/versions/RewardDistributorV3.json");
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcDelegator.json");
const JUSDC_DELEGATE_ARTIFACT = require("../deployments/avalanche/JUsdcDelegate.json");

const MULTISIG_ADDRESS = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
const DEV_ADDRESS = "0xD858eBAa943b4C2fb06BA0Ba8920A132fd2410eE";
const USDC_LENDER = "0x26b31b6d07c4b3a9339a2fb89c4d8a3dfb402431";
const JOE_ADDRESS = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";

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
      "RewardDistributorV2"
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
            blockNumber: 13175236,
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
    this.rewardDistributorNew = await upgrades.deployProxy(
      this.RewardDistributorCFNew,
      []
    );

    await this.rewardDistributorNew.setAdmin(this.dev.address);

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
  });

  it("automatically accrues rewards for current lenders after upgrade", async function () {
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

    // Expect rewards to be equal to 0, forfeiting rewards from previous rewarder
    const rewardsAtT0 = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAtT0).to.be.equal(0);

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
    expect(rewardsAtT10).to.be.above(rewardsAtT0);

    // Fast forward 10 days
    await increase(duration.days(10));

    // Assert USDC lender has accrued rewards for supplying for 10 days
    const rewardsAtD10 = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAtD10).to.be.closeTo(
      rewardsAtT0.add(
        rewardsAtT10
          .sub(rewardsAtT0)
          .div("10")
          .mul(10 * 86400)
      ),
      ethers.utils.parseEther("0.001")
    );
  });

  it("Admins are able to set pending rewards", async function () {
    // We use an interface so we can actually query claimReward
    const rewarderNew = await ethers.getContractAt(
      "IRewardDistributorTest",
      this.rewardDistributorNew.address
    );
    const rewarderOld = await ethers.getContractAt(
      "IRewardDistributorTest",
      this.rewardDistributorOld.address
    );

    await this.rewardDistributorNew.connect(this.dev).setJoe(this.joe.address);
    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributorNew.address);

    // Set reward speeds for JOE for jUSDC market
    await this.rewardDistributorNew
      .connect(this.dev)
      .initializeRewardAccrued(
        0,
        [USDC_LENDER],
        [ethers.utils.parseEther("100")]
      );
    await this.rewardDistributorNew
      .connect(this.dev)
      .lockInitializeRewardAccrued();

    await expect(
      this.rewardDistributorNew
        .connect(this.dev)
        .initializeRewardAccrued(
          0,
          [USDC_LENDER],
          [ethers.utils.parseEther("100000")]
        )
    ).to.be.revertedWith("initializeRewardAccrued is locked");

    let previousBalance = await this.joe.balanceOf(USDC_LENDER);
    await rewarderNew.claimReward("0", USDC_LENDER);
    expect(
      (await this.joe.balanceOf(USDC_LENDER)).sub(previousBalance)
    ).to.be.equal(ethers.utils.parseEther("100"));
  });

  it("Pendind rewards match actual claim", async function () {
    await this.rewardDistributorNew.connect(this.dev).setJoe(this.joe.address);
    await this.joetroller
      .connect(this.admin)
      ._setRewardDistributor(this.rewardDistributorNew.address);
    // We use an interface so we can actually query pendingReward
    const rewarderNew = await ethers.getContractAt(
      "IRewardDistributorTest",
      this.rewardDistributorNew.address
    );

    // We call claim to clear the rewards from the old rewarder
    await rewarderNew.claimReward(0, USDC_LENDER);

    await this.rewardDistributorNew
      .connect(this.dev)
      .setRewardSpeed(
        0,
        this.jUsdc.address,
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("0.1")
      );

    await increase(duration.days(1));

    const reward = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(
      await this.rewardDistributorNew.pendingReward(0, USDC_LENDER)
    ).to.be.equal(reward);
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
