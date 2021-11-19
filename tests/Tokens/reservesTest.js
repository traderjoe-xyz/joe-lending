const { avaxUnsigned, avaxMantissa, both } = require("../Utils/Avalanche");

const { fastForward, makeJToken } = require("../Utils/BankerJoe");

const factor = avaxMantissa(0.02);

const reserves = avaxUnsigned(3e12);
const cash = avaxUnsigned(reserves.multipliedBy(2));
const reduction = avaxUnsigned(2e12);

describe("JToken", function () {
  let root, accounts;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe("_setReserveFactorFresh", () => {
    let jToken;
    beforeEach(async () => {
      jToken = await makeJToken();
    });

    it("rejects change by non-admin", async () => {
      expect(
        await send(jToken, "harnessSetReserveFactorFresh", [factor], {
          from: accounts[0],
        })
      ).toHaveTokenFailure("UNAUTHORIZED", "SET_RESERVE_FACTOR_ADMIN_CHECK");
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });

    it("rejects change if market not fresh", async () => {
      expect(await send(jToken, "harnessFastForward", [5])).toSucceed();
      expect(
        await send(jToken, "harnessSetReserveFactorFresh", [factor])
      ).toHaveTokenFailure(
        "MARKET_NOT_FRESH",
        "SET_RESERVE_FACTOR_FRESH_CHECK"
      );
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });

    it("rejects newReserveFactor that descales to 1", async () => {
      expect(
        await send(jToken, "harnessSetReserveFactorFresh", [avaxMantissa(1.01)])
      ).toHaveTokenFailure("BAD_INPUT", "SET_RESERVE_FACTOR_BOUNDS_CHECK");
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });

    it("accepts newReserveFactor in valid range and emits log", async () => {
      const result = await send(jToken, "harnessSetReserveFactorFresh", [
        factor,
      ]);
      expect(result).toSucceed();
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(factor);
      expect(result).toHaveLog("NewReserveFactor", {
        oldReserveFactorMantissa: "0",
        newReserveFactorMantissa: factor.toString(),
      });
    });

    it("accepts a change back to zero", async () => {
      const result1 = await send(jToken, "harnessSetReserveFactorFresh", [
        factor,
      ]);
      const result2 = await send(jToken, "harnessSetReserveFactorFresh", [0]);
      expect(result1).toSucceed();
      expect(result2).toSucceed();
      expect(result2).toHaveLog("NewReserveFactor", {
        oldReserveFactorMantissa: factor.toString(),
        newReserveFactorMantissa: "0",
      });
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });
  });

  describe("_setReserveFactor", () => {
    let jToken;
    beforeEach(async () => {
      jToken = await makeJToken();
    });

    beforeEach(async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
      await send(jToken, "_setReserveFactor", [0]);
    });

    it("emits a reserve factor failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await fastForward(jToken, 1);
      await expect(
        send(jToken, "_setReserveFactor", [factor])
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });

    it("returns error from setReserveFactorFresh without emitting any extra logs", async () => {
      const { reply, receipt } = await both(jToken, "_setReserveFactor", [
        avaxMantissa(2),
      ]);
      expect(reply).toHaveTokenError("BAD_INPUT");
      expect(receipt).toHaveTokenFailure(
        "BAD_INPUT",
        "SET_RESERVE_FACTOR_BOUNDS_CHECK"
      );
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });

    it("returns success from setReserveFactorFresh", async () => {
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
      expect(await send(jToken, "harnessFastForward", [5])).toSucceed();
      expect(await send(jToken, "_setReserveFactor", [factor])).toSucceed();
      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(factor);
    });
  });

  describe("_reduceReservesFresh", () => {
    let jToken;
    beforeEach(async () => {
      jToken = await makeJToken();
      expect(
        await send(jToken, "harnessSetTotalReserves", [reserves])
      ).toSucceed();
      expect(
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          cash,
        ])
      ).toSucceed();
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(jToken, "harnessReduceReservesFresh", [reduction], {
          from: accounts[0],
        })
      ).toHaveTokenFailure("UNAUTHORIZED", "REDUCE_RESERVES_ADMIN_CHECK");
      expect(await call(jToken, "totalReserves")).toEqualNumber(reserves);
    });

    it("fails if market not fresh", async () => {
      expect(await send(jToken, "harnessFastForward", [5])).toSucceed();
      expect(
        await send(jToken, "harnessReduceReservesFresh", [reduction])
      ).toHaveTokenFailure("MARKET_NOT_FRESH", "REDUCE_RESERVES_FRESH_CHECK");
      expect(await call(jToken, "totalReserves")).toEqualNumber(reserves);
    });

    it("fails if amount exceeds reserves", async () => {
      expect(
        await send(jToken, "harnessReduceReservesFresh", [reserves.plus(1)])
      ).toHaveTokenFailure("BAD_INPUT", "REDUCE_RESERVES_VALIDATION");
      expect(await call(jToken, "totalReserves")).toEqualNumber(reserves);
    });

    it("fails if amount exceeds available cash", async () => {
      const cashLessThanReserves = reserves.minus(2);
      await send(jToken.underlying, "harnessSetBalance", [
        jToken._address,
        cashLessThanReserves,
      ]);
      expect(
        await send(jToken, "harnessReduceReservesFresh", [reserves])
      ).toHaveTokenFailure(
        "TOKEN_INSUFFICIENT_CASH",
        "REDUCE_RESERVES_CASH_NOT_AVAILABLE"
      );
      expect(await call(jToken, "totalReserves")).toEqualNumber(reserves);
    });

    it("increases admin balance and reduces reserves on success", async () => {
      const balance = avaxUnsigned(
        await call(jToken.underlying, "balanceOf", [root])
      );
      expect(
        await send(jToken, "harnessReduceReservesFresh", [reserves])
      ).toSucceed();
      expect(await call(jToken.underlying, "balanceOf", [root])).toEqualNumber(
        balance.plus(reserves)
      );
      expect(await call(jToken, "totalReserves")).toEqualNumber(0);
    });

    it("emits an event on success", async () => {
      const result = await send(jToken, "harnessReduceReservesFresh", [
        reserves,
      ]);
      expect(result).toHaveLog("ReservesReduced", {
        admin: root,
        reduceAmount: reserves.toString(),
        newTotalReserves: "0",
      });
    });
  });

  describe("_reduceReserves", () => {
    let jToken;
    beforeEach(async () => {
      jToken = await makeJToken();
      await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
      expect(
        await send(jToken, "harnessSetTotalReserves", [reserves])
      ).toSucceed();
      expect(
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          cash,
        ])
      ).toSucceed();
    });

    it("emits a reserve-reduction failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await fastForward(jToken, 1);
      await expect(
        send(jToken, "_reduceReserves", [reduction])
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from _reduceReservesFresh without emitting any extra logs", async () => {
      const { reply, receipt } = await both(
        jToken,
        "harnessReduceReservesFresh",
        [reserves.plus(1)]
      );
      expect(reply).toHaveTokenError("BAD_INPUT");
      expect(receipt).toHaveTokenFailure(
        "BAD_INPUT",
        "REDUCE_RESERVES_VALIDATION"
      );
    });

    it("returns success code from _reduceReservesFresh and reduces the correct amount", async () => {
      expect(await call(jToken, "totalReserves")).toEqualNumber(reserves);
      expect(await send(jToken, "harnessFastForward", [5])).toSucceed();
      expect(await send(jToken, "_reduceReserves", [reduction])).toSucceed();
    });
  });

  describe("gulp", () => {
    let jToken;
    beforeEach(async () => {
      jToken = await makeJToken({ kind: "jcapable" });
    });

    it("absorbs excess cash into reserves", async () => {
      expect(
        await send(jToken.underlying, "transfer", [jToken._address, cash])
      ).toSucceed();
      expect(await send(jToken, "gulp")).toSucceed();
      expect(await call(jToken, "getCash")).toEqualNumber(cash);
      expect(await call(jToken, "totalReserves")).toEqualNumber(cash);
    });
  });
});
