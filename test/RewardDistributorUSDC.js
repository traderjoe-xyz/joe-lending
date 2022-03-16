const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { duration, increase } = require("./utilities/time");

describe("Enabling USDC native rewards", function () {
  before(async function () {

    // Addresses
    this.rewarderAddress = "0x45B2C4139d96F44667577C0D7F7a7D170B420324";
    this.rewarderAdminAddress = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
    this.usdcAddress = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
    this.jusdcAddress = "0x29472D511808Ce925F501D25F9Ee9efFd2328db2";
    this.comptrollerAddress = "0xdc13687554205E5b89Ac783db14bb5bba4A1eDaC";
    this.usdcHolder = "0xBF14DB80D9275FB721383a77C00Ae180fc40ae98";
    this.joeAddress = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
  });

  beforeEach(async function () {
    // We reset the state before each tests
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
            blockNumber: 12183315,
          },
          live: false,
          saveDeployments: false,
          tags: ["test", "local"],
        },
      ],
    });

    // Accounts
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [this.rewarderAdminAddress],
    });
    this.rewarderAdmin = await ethers.getSigner(this.rewarderAdminAddress);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [this.usdcHolder],
    });
    this.depositor = await ethers.getSigner(this.usdcHolder);

    // Contracts
    // const fs = require('fs')
    // await hre.network.provider.send(
    //     "hardhat_setCode",
    //     [this.rewarderAddress, JSON.parse(fs.readFileSync('artifacts/contracts/RewardDistributor.sol/RewardDistributor.json')).deployedBytecode]
    // );

    this.usdcToken = await ethers.getContractAt(
        "EIP20Interface",
        this.usdcAddress
    );
    this.rewarder = await ethers.getContractAt(
        "RewardDistributor",
        this.rewarderAddress
    )
    this.comptroller = await ethers.getContractAt(
        "Joetroller", //"IComptroller",
        this.comptrollerAddress
    );
    this.jusdcToken = await ethers.getContractAt(
        "JErc20",
        this.jusdcAddress
    );
    this.joe = await ethers.getContractAt(
        "EIP20Interface",
        this.joeAddress
    )

    // Approve the spender
    await this.usdcToken.connect(this.depositor).approve(this.jusdcAddress, 1*10**10);
  });

  it("reverts when minting if reward rate < 1*10**11", async function () {
	await this.rewarder.connect(this.rewarderAdmin)._setRewardSpeed(0, this.jusdcAddress, String(1*10**10), 0)
    expect(
      this.jusdcToken.connect(this.depositor).mint(1*10**6)
    ).to.be.revertedWith('subtraction underflow')
  });

  it("accrues reward if reward rate > 1*10**15", async function () {
    await this.jusdcToken.connect(this.depositor).mint(1*10**6)
	await this.rewarder.connect(this.rewarderAdmin)._setRewardSpeed(0, this.jusdcAddress, String(1*10**16), 0)
	await this.rewarder.connect(this.rewarderAdmin)
      .updateAndDistributeSupplierRewardsForToken(this.jusdcAddress, this.usdcHolder);
    expect(
      await this.rewarder.rewardAccrued(0, this.usdcHolder)
    ).to.equal("7907683090")  // fails with 33636821352
  });

  it("only accrues rewards from when rewards enabled", async function () {
    await this.jusdcToken.connect(this.depositor).mint(1*10**6)
    await increase(duration.days(30));

    // From here is the same as the above test.
    await this.rewarder.connect(this.rewarderAdmin)._setRewardSpeed(0, this.jusdcAddress, String(1*10**16), 0)
    await this.rewarder.connect(this.rewarderAdmin).updateAndDistributeSupplierRewardsForToken(this.jusdcAddress, this.usdcHolder);
    expect(
      await this.rewarder.rewardAccrued(0, this.usdcHolder)
    ).to.equal("7907683090")  // fails with 33344996823534703
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
