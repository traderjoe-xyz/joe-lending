const { ethers, network } = require("hardhat");
const { expect } = require("chai");

const UNITROLLER_ARTIFACT = require("../deployments/avalanche/Unitroller.json");
const JOELENS_ARTIFACT = require("../deployments/avalanche/JoeLens.json");
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcDelegator.json");
const JUSDC_DELEGATE_ARTIFACT_V2 = require("../deployments/avalanche/versions/JUsdcDelegateV2.json");

const TIMELOCK_ADDRESS = "0x243cc1760F0b96c533C11656491e7EBB9663Bf33";
const USDC_LENDER = "0x66Fb02746d72bC640643FdBa3aEFE9C126f0AA4f";
const JOE_ADDRESS = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";

describe("RewardDistributor", function () {
  before(async function () {
    // Accounts
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];

    // ABIs
    this.JUsdcDelegator = await ethers.getContractFactory(
      "JCollateralCapErc20Delegator"
    );
    this.JUsdcDelegateCFOld = await ethers.getContractFactory(
      JUSDC_DELEGATE_ARTIFACT_V2.abi,
      JUSDC_DELEGATE_ARTIFACT_V2.bytecode
    );
    this.JUsdcDelegateCFNew = await ethers.getContractFactory(
      "JCollateralCapErc20Delegate"
    );

    this.JoetrollerCF = await ethers.getContractFactory("Joetroller");
    this.JoeLensCF = await ethers.getContractFactory("JoeLens");
    this.JoeCF = await ethers.getContractFactory("JErc20");

    // Contracts
    this.jUsdcDelegator = await this.JUsdcDelegator.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );
    this.jUsdc = await this.JUsdcDelegateCFOld.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );
    this.joetroller = await this.JoetrollerCF.attach(
      UNITROLLER_ARTIFACT.address
    );
    this.joeLens = await this.JoeLensCF.attach(JOELENS_ARTIFACT.address);
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
            blockNumber: 7788780,
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

    // Impersonate a USDC lender
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_LENDER],
    });
    this.usdcLender = await ethers.getSigner(USDC_LENDER);

    // Deploy new jUSDC implementation
    this.jUsdcDelegateNew = await this.JUsdcDelegateCFNew.deploy();
  });

  it("should reset rewards if asset is redeemed before claiming", async function () {
    // Get USDC lender who has accrued rewards from V1
    const rewardsBefore = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsBefore).to.be.gt("0");

    const jTokenBalanceBefore = await this.jUsdc.balanceOf(USDC_LENDER);
    expect(jTokenBalanceBefore).to.be.gt("0");

    // Redeem all
    await this.jUsdc.connect(this.usdcLender).redeem(jTokenBalanceBefore);

    const jTokenBalanceAfter = await this.jUsdc.balanceOf(USDC_LENDER);
    expect(jTokenBalanceAfter).to.be.equal("0");

    const rewardsAfter = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAfter).to.be.lt(rewardsBefore);
  });

  it("should not reset rewards if asset is redeemed before claiming", async function () {
    // Get USDC lender who has accrued rewards from V1
    const rewardsBefore = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsBefore).to.be.gt("0");

    // Upgrade jUSDC implementation
    await this.jUsdcDelegator
      .connect(this.admin)
      ._setImplementation(this.jUsdcDelegateNew.address, false, "0x");

    const jTokenBalanceBefore = await this.jUsdc.balanceOf(USDC_LENDER);
    expect(jTokenBalanceBefore).to.be.gt("0");

    // Redeem all
    await this.jUsdc.connect(this.usdcLender).redeem(jTokenBalanceBefore);

    const jTokenBalanceAfter = await this.jUsdc.balanceOf(USDC_LENDER);
    expect(jTokenBalanceAfter).to.be.equal("0");

    const rewardsAfter = await this.joeLens.callStatic[
      "getClaimableRewards(uint8,address,address,address)"
    ](0, this.joetroller.address, this.joe.address, USDC_LENDER);
    expect(rewardsAfter).to.be.gt(rewardsBefore);
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
