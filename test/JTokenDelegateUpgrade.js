const { ethers, network } = require("hardhat");
const { expect } = require("chai");

const MULTISIG_ADDRESS = "0x3876183b75916e20d2ADAB202D1A3F9e9bf320ad";
const JUSDC_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JUsdcDelegator.json");
const JERC20_DELEGATE_ARTIFACT = require("../deployments/avalanche/JUsdcDelegate.json");
const JAVAX_DELEGATOR_ARTIFACT = require("../deployments/avalanche/JAvaxDelegator.json");
const JNATIVE_DELEGATE_ARTIFACT = require("../deployments/avalanche/JAvaxDelegate.json");

describe("JCollateralCapErc20 and JWrappedNative implementation upgrades", function () {
  before(async function () {
    // Accounts
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];

    // ABIs
    this.JUsdcDelegatorCF = await ethers.getContractFactory(
      JUSDC_DELEGATOR_ARTIFACT.abi,
      JUSDC_DELEGATOR_ARTIFACT.bytecode
    );
    this.JUsdcDelegateCFOld = await ethers.getContractFactory(
      JERC20_DELEGATE_ARTIFACT.abi,
      JERC20_DELEGATE_ARTIFACT.bytecode
    );
    this.JUsdcDelegateCFNew = await ethers.getContractFactory(
      "JCollateralCapErc20Delegate"
    );

    this.JAvaxDelegatorCF = await ethers.getContractFactory(
      JAVAX_DELEGATOR_ARTIFACT.abi,
      JAVAX_DELEGATOR_ARTIFACT.bytecode
    );
    this.JAvaxDelegateCFOld = await ethers.getContractFactory(
      JNATIVE_DELEGATE_ARTIFACT.abi,
      JNATIVE_DELEGATE_ARTIFACT.bytecode
    );
    this.JAvaxDelegateCFNew = await ethers.getContractFactory(
      "JWrappedNativeDelegate"
    );

    // Contracts
    this.jUsdcDelegator = await this.JUsdcDelegatorCF.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );
    this.jUsdc = await this.JUsdcDelegateCFOld.attach(
      JUSDC_DELEGATOR_ARTIFACT.address
    );

    this.jAvaxDelegator = await this.JAvaxDelegatorCF.attach(
      JAVAX_DELEGATOR_ARTIFACT.address
    );
    this.jAvax = await this.JAvaxDelegateCFOld.attach(
      JAVAX_DELEGATOR_ARTIFACT.address
    );
  });

  beforeEach(async function () {
    // We reset the state before each tests
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
          },
          live: false,
          saveDeployments: true,
          tags: ["test", "local"],
        },
      ],
    });
    // Impersonate Timelock address, which is the owner of lending contracts
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [MULTISIG_ADDRESS],
    });
    // Account
    this.admin = await ethers.getSigner(MULTISIG_ADDRESS);
    // Fund admin with AVAX
    await this.alice.sendTransaction({
      to: this.admin.address,
      value: ethers.utils.parseEther("10"),
    });
  });

  describe("Upgrades", function () {
    it("successfully upgrades JCollateralCapErc20Delegate", async function () {
      // Get storage values before upgrade
      const implBefore = await this.jUsdc.implementation();
      const totalSupplyBefore = await this.jUsdc.totalSupply();
      const totalBorrowsBefore = await this.jUsdc.totalBorrows();
      const totalReservesBefore = await this.jUsdc.totalReserves();
      const totalCashBefore = await this.jUsdc.getCash();
      const borrowIndexBefore = await this.jUsdc.borrowIndex();
      const internalCashBefore = await this.jUsdc.internalCash();
      const totalCollateralTokensBefore =
        await this.jUsdc.totalCollateralTokens();

      const newDelegate = await this.JUsdcDelegateCFNew.deploy();

      // Upgrade implementation contract
      await this.jUsdcDelegator
        .connect(this.admin)
        ._setImplementation(newDelegate.address, false, "0x");
      this.jUsdc = await this.JUsdcDelegateCFNew.attach(
        JUSDC_DELEGATOR_ARTIFACT.address
      );

      // Get storage values after upgrade
      const implAfter = await this.jUsdc.implementation();
      const protocolSeizeShareMantissa =
        await this.jUsdc.protocolSeizeShareMantissa();
      const totalSupplyAfter = await this.jUsdc.totalSupply();
      const totalBorrowsAfter = await this.jUsdc.totalBorrows();
      const totalReservesAfter = await this.jUsdc.totalReserves();
      const totalCashAfter = await this.jUsdc.getCash();
      const borrowIndexAfter = await this.jUsdc.borrowIndex();
      const internalCashAfter = await this.jUsdc.internalCash();
      const totalCollateralTokensAfter =
        await this.jUsdc.totalCollateralTokens();

      // Assert successful upgrade
      expect(implBefore).to.not.equal(implAfter);

      // Assert storage values are unchanged
      expect(totalSupplyBefore).to.equal(totalSupplyAfter);
      expect(totalBorrowsBefore).to.equal(totalBorrowsAfter);
      expect(totalReservesBefore).to.equal(totalReservesAfter);
      expect(totalCashBefore).to.equal(totalCashAfter);
      expect(borrowIndexBefore).to.equal(borrowIndexAfter);
      expect(internalCashBefore).to.equal(internalCashAfter);
      expect(totalCollateralTokensBefore).to.equal(totalCollateralTokensAfter);
    });

    it("successfully upgrades JWrappedNativeDelegate", async function () {
      // Get storage values before upgrade
      const implBefore = await this.jAvax.implementation();
      const totalSupplyBefore = await this.jAvax.totalSupply();
      const totalBorrowsBefore = await this.jAvax.totalBorrows();
      const totalReservesBefore = await this.jAvax.totalReserves();
      const totalCashBefore = await this.jAvax.getCash();
      const borrowIndexBefore = await this.jAvax.borrowIndex();

      const newDelegate = await this.JAvaxDelegateCFNew.deploy();

      // Upgrade implementation contract
      await this.jAvaxDelegator
        .connect(this.admin)
        ._setImplementation(newDelegate.address, false, "0x");
      this.jAvax = await this.JAvaxDelegateCFNew.attach(
        JAVAX_DELEGATOR_ARTIFACT.address
      );

      // Get storage values after upgrade
      const implAfter = await this.jAvax.implementation();
      const totalSupplyAfter = await this.jAvax.totalSupply();
      const totalBorrowsAfter = await this.jAvax.totalBorrows();
      const totalReservesAfter = await this.jAvax.totalReserves();
      const totalCashAfter = await this.jAvax.getCash();
      const borrowIndexAfter = await this.jAvax.borrowIndex();

      // Assert successful upgrade
      expect(implBefore).to.not.equal(implAfter);

      // Assert storage values are unchanged
      expect(totalSupplyBefore).to.equal(totalSupplyAfter);
      expect(totalBorrowsBefore).to.equal(totalBorrowsAfter);
      expect(totalReservesBefore).to.equal(totalReservesAfter);
      expect(totalCashBefore).to.equal(totalCashAfter);
      expect(borrowIndexBefore).to.equal(borrowIndexAfter);
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
