const {
  avaxUnsigned,
  avaxMantissa,
  mergeInterface,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  makeFlashloanReceiver,
  balanceOf,
} = require("../Utils/BankerJoe");

describe("Flashloan test", function () {
  let jToken;
  let flashloanReceiver;
  let flashloanLender;
  let cash = 1000_000;
  let receiverBalance = 100;
  let reservesFactor = 0.5;

  beforeEach(async () => {
    jToken = await makeJToken({ kind: "jwrapped", supportMarket: true });
    flashloanReceiver = await makeFlashloanReceiver({ kind: "native" });
    flashloanLender = await deploy("FlashloanLender", [
      jToken.joetroller._address,
      saddle.accounts[0],
    ]);

    // so that we can format jToken event logs
    mergeInterface(flashloanReceiver, jToken);

    await send(jToken.underlying, "harnessSetBalance", [jToken._address, cash]);
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
        cash + totalFee
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
        cash + totalFee
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
        cash + totalFee
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

  beforeEach(async () => {
    jToken = await makeJToken({ kind: "jwrapped", supportMarket: true });
    flashloanLender = await deploy("FlashloanLender", [
      jToken.joetroller._address,
      saddle.accounts[0],
    ]);
    await send(jToken.underlying, "harnessSetBalance", [jToken._address, cash]);
    await send(jToken, "harnessSetBlockTimestamp", [avaxUnsigned(1e6)]);
    await send(jToken, "harnessSetAccrualBlockTimestamp", [avaxUnsigned(1e6)]);
  });

  it("flashloan and mint", async () => {
    const flashloanAndMint = await makeFlashloanReceiver({
      kind: "flashloan-and-mint-native",
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
      kind: "flashloan-and-repay-borrow-native",
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
      kind: "flashloan-twice-native",
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
