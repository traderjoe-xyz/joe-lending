const {
  avaxUnsigned,
  avaxMantissa,
  mergeInterface,
  unlockedAccount,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  makeFlashloanReceiver,
  balanceOf,
} = require("../Utils/BankerJoe");

describe("Flashloan test", function () {
  let admin;
  let nonAdmin;
  let jToken;
  let flashloanReceiver;
  let flashloanLender;
  let cash = 1000_000;
  let cashOnChain = 1000_000;
  let receiverBalance = 100;
  let reservesFactor = 0.5;

  beforeEach(async () => {
    admin = saddle.accounts[0];
    nonAdmin = saddle.accounts[1];
    jToken = await makeJToken({ kind: "jcollateralcap", supportMarket: true });
    flashloanReceiver = await makeFlashloanReceiver();
    flashloanLender = await deploy("FlashloanLender", [
      jToken.joetroller._address,
      admin,
    ]);

    // so that we can format jToken event logs
    mergeInterface(flashloanReceiver, jToken);

    await send(jToken.underlying, "harnessSetBalance", [
      jToken._address,
      cashOnChain,
    ]);
    await send(jToken, "harnessSetInternalCash", [cash]);
    await send(jToken, "harnessSetBlockTimestamp", [avaxUnsigned(1e6)]);
    await send(jToken, "harnessSetAccrualBlockTimestamp", [avaxUnsigned(1e6)]);
    await send(jToken, "harnessSetReserveFactorFresh", [
      avaxMantissa(reservesFactor),
    ]);

    await send(jToken.underlying, "harnessSetBalance", [
      flashloanReceiver._address,
      receiverBalance,
    ]);
  });

  describe("test FlashLoanLender interface", () => {
    let unsupportedJToken;
    beforeEach(async () => {
      unsupportedJToken = await makeJToken({
        kind: "jcollateralcap",
        supportMarket: true,
      });
    });
    it("test deployment of flashLoanLender with a joetroller containging jAvax market", async () => {
      let jAvax = await makeJToken({ kind: "javax" });
      await deploy("FlashloanLender", [jAvax.joetroller._address, admin]);
    });
    it("test maxFlashLoan return 0 for unsupported token", async () => {
      expect(
        await call(flashloanLender, "maxFlashLoan", [
          unsupportedJToken.underlying._address,
        ])
      ).toEqualNumber(0);
      expect(
        await call(flashloanLender, "maxFlashLoan", [
          jToken.underlying._address,
        ])
      ).toEqualNumber(cashOnChain);
    });
    it("test flashFee revert for unsupported token", async () => {
      const borrowAmount = 10_000;
      const totalFee = 8;
      await expect(
        call(flashloanLender, "flashFee", [
          unsupportedJToken.underlying._address,
          borrowAmount,
        ])
      ).rejects.toRevert(
        "revert cannot find jToken of this underlying in the mapping"
      );
      expect(
        await call(flashloanLender, "flashFee", [
          jToken.underlying._address,
          borrowAmount,
        ])
      ).toEqualNumber(totalFee);
    });
    it("test updateUnderlyingMapping", async () => {
      const borrowAmount = 10_000;
      const totalFee = 8;
      await send(flashloanLender, "updateUnderlyingMapping", [
        [unsupportedJToken._address],
      ]);
      expect(
        await call(flashloanLender, "flashFee", [
          jToken.underlying._address,
          borrowAmount,
        ])
      ).toEqualNumber(totalFee);
    });
    it("test removeUnderlyingMapping", async () => {
      const borrowAmount = 10_000;
      await send(flashloanLender, "removeUnderlyingMapping", [
        [jToken._address],
      ]);
      await expect(
        call(flashloanLender, "flashFee", [
          jToken.underlying._address,
          borrowAmount,
        ])
      ).rejects.toRevert(
        "revert cannot find jToken of this underlying in the mapping"
      );
    });
    it("test onlyOwner", async () => {
      await expect(
        send(
          flashloanLender,
          "updateUnderlyingMapping",
          [[unsupportedJToken._address]],
          { from: nonAdmin }
        )
      ).rejects.toRevert("revert not owner");
    });
  });

  describe("internal cash equal underlying balance", () => {
    it("repay correctly", async () => {
      const borrowAmount = 10_000;
      const totalFee = 8;
      const reservesFee = 4;
      const result = await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);

      expect(result).toHaveLog("Flashloan", {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      });

      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        cashOnChain + totalFee
      );
      expect(await call(jToken, "getCash", [])).toEqualNumber(cash + totalFee);
      expect(await call(jToken, "totalReserves", [])).toEqualNumber(
        reservesFee
      );
      expect(
        await balanceOf(jToken.underlying, flashloanReceiver._address)
      ).toEqualNumber(receiverBalance - totalFee);
    });

    it("repay correctly, total fee is truncated", async () => {
      const borrowAmount = 1000;
      const totalFee = 0;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);

      expect(result).toHaveLog("Flashloan", {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      });

      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        cashOnChain + totalFee
      );
      expect(await call(jToken, "getCash", [])).toEqualNumber(cash + totalFee);
      expect(await call(jToken, "totalReserves", [])).toEqualNumber(
        reservesFee
      );
      expect(
        await balanceOf(jToken.underlying, flashloanReceiver._address)
      ).toEqualNumber(receiverBalance - totalFee);
    });

    it("repay correctly, reserve fee is truncated", async () => {
      const borrowAmount = 1250;
      const totalFee = 1;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);

      expect(result).toHaveLog("Flashloan", {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      });

      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        cashOnChain + totalFee
      );
      expect(await call(jToken, "getCash", [])).toEqualNumber(cash + totalFee);
      expect(await call(jToken, "totalReserves", [])).toEqualNumber(
        reservesFee
      );
      expect(
        await balanceOf(jToken.underlying, flashloanReceiver._address)
      ).toEqualNumber(receiverBalance - totalFee);
    });

    it("borrow exceed cash", async () => {
      const borrowAmount = cash + 1;
      const totalFee = 3;
      const result = send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);
      await expect(result).rejects.toRevert("revert INSUFFICIENT_LIQUIDITY");
    });
  });

  describe("internal cash less than underlying balance", () => {
    beforeEach(async () => {
      // increase underlying balance without setting internal cash
      cashOnChain = cash + 100;
      await send(jToken.underlying, "harnessSetBalance", [
        jToken._address,
        cashOnChain,
      ]);
    });

    afterEach(async () => {
      cashOnChain = cash;
    });

    it("repay correctly", async () => {
      const borrowAmount = 10_000;
      const totalFee = 8;
      const reservesFee = 4;
      const result = await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);

      expect(result).toHaveLog("Flashloan", {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      });

      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        cashOnChain + totalFee
      );
      expect(await call(jToken, "getCash", [])).toEqualNumber(cash + totalFee);
      expect(await call(jToken, "totalReserves", [])).toEqualNumber(
        reservesFee
      );
      expect(
        await balanceOf(jToken.underlying, flashloanReceiver._address)
      ).toEqualNumber(receiverBalance - totalFee);
    });

    it("repay correctly, total fee is truncated", async () => {
      const borrowAmount = 1000;
      const totalFee = 0;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);

      expect(result).toHaveLog("Flashloan", {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      });

      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        cashOnChain + totalFee
      );
      expect(await call(jToken, "getCash", [])).toEqualNumber(cash + totalFee);
      expect(await call(jToken, "totalReserves", [])).toEqualNumber(
        reservesFee
      );
      expect(
        await balanceOf(jToken.underlying, flashloanReceiver._address)
      ).toEqualNumber(receiverBalance - totalFee);
    });

    it("repay correctly, reserve fee is truncated", async () => {
      const borrowAmount = 1250;
      const totalFee = 1;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);

      expect(result).toHaveLog("Flashloan", {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      });

      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        cashOnChain + totalFee
      );
      expect(await call(jToken, "getCash", [])).toEqualNumber(cash + totalFee);
      expect(await call(jToken, "totalReserves", [])).toEqualNumber(
        reservesFee
      );
      expect(
        await balanceOf(jToken.underlying, flashloanReceiver._address)
      ).toEqualNumber(receiverBalance - totalFee);
    });

    it("borrow exceed cash", async () => {
      const borrowAmount = cash + 1;
      const totalFee = 3;
      const result = send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ]);
      await expect(result).rejects.toRevert("revert INSUFFICIENT_LIQUIDITY");
    });
  });

  it("reject by joetroller", async () => {
    const borrowAmount = 10_000;
    const totalFee = 8;
    expect(
      await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ])
    ).toSucceed();

    await send(jToken.joetroller, "_setFlashloanPaused", [
      jToken._address,
      true,
    ]);

    await expect(
      send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ])
    ).rejects.toRevert("revert flashloan is paused");

    await send(jToken.joetroller, "_setFlashloanPaused", [
      jToken._address,
      false,
    ]);

    expect(
      await send(flashloanReceiver, "doFlashloan", [
        flashloanLender._address,
        jToken._address,
        borrowAmount,
        borrowAmount + totalFee,
      ])
    ).toSucceed();
  });
});

describe("Flashloan re-entry test", () => {
  let jToken;
  let cash = 1000_000;
  let admin;
  let flashloanLender;

  beforeEach(async () => {
    admin = saddle.accounts[0];
    jToken = await makeJToken({ kind: "jcollateralcap", supportMarket: true });
    flashloanLender = await deploy("FlashloanLender", [
      jToken.joetroller._address,
      admin,
    ]);
    await send(jToken.underlying, "harnessSetBalance", [jToken._address, cash]);
    await send(jToken, "harnessSetInternalCash", [cash]);
    await send(jToken, "harnessSetBlockTimestamp", [avaxUnsigned(1e6)]);
    await send(jToken, "harnessSetAccrualBlockTimestamp", [avaxUnsigned(1e6)]);
  });

  it("flashloan and mint", async () => {
    const flashloanAndMint = await makeFlashloanReceiver({
      kind: "flashloan-and-mint",
    });
    const borrowAmount = 100;
    const result = send(flashloanAndMint, "doFlashloan", [
      flashloanLender._address,
      jToken._address,
      borrowAmount,
    ]);
    await expect(result).rejects.toRevert("revert re-entered");
  });

  it("flashloan and repay borrow", async () => {
    const flashloanAndRepayBorrow = await makeFlashloanReceiver({
      kind: "flashloan-and-repay-borrow",
    });
    const borrowAmount = 100;
    const result = send(flashloanAndRepayBorrow, "doFlashloan", [
      flashloanLender._address,
      jToken._address,
      borrowAmount,
    ]);
    await expect(result).rejects.toRevert("revert re-entered");
  });

  it("flashloan twice", async () => {
    const flashloanTwice = await makeFlashloanReceiver({
      kind: "flashloan-twice",
    });
    const borrowAmount = 100;
    const result = send(flashloanTwice, "doFlashloan", [
      flashloanLender._address,
      jToken._address,
      borrowAmount,
    ]);
    await expect(result).rejects.toRevert("revert re-entered");
  });
});
