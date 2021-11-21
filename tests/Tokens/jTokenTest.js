const {
  avaxUnsigned,
  avaxMantissa,
  UInt256Max,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  setBorrowRate,
  pretendBorrow,
} = require("../Utils/BankerJoe");

describe("JToken", function () {
  let root, admin, accounts;
  beforeEach(async () => {
    [root, admin, ...accounts] = saddle.accounts;
  });

  describe("constructor", () => {
    it("fails when non erc-20 underlying", async () => {
      await expect(
        makeJToken({ underlying: { _address: root } })
      ).rejects.toRevert("revert");
    });

    it("fails when 0 initial exchange rate", async () => {
      await expect(makeJToken({ exchangeRate: 0 })).rejects.toRevert(
        "revert initial exchange rate must be greater than zero."
      );
    });

    it("succeeds with erc-20 underlying and non-zero exchange rate", async () => {
      const jToken = await makeJToken();
      expect(await call(jToken, "underlying")).toEqual(
        jToken.underlying._address
      );
      expect(await call(jToken, "admin")).toEqual(root);
    });

    it("succeeds when setting admin to contructor argument", async () => {
      const jToken = await makeJToken({ admin: admin });
      expect(await call(jToken, "admin")).toEqual(admin);
    });
  });

  describe("name, symbol, decimals", () => {
    let jToken;

    beforeEach(async () => {
      jToken = await makeJToken({
        name: "JToken Foo",
        symbol: "cFOO",
        decimals: 10,
      });
    });

    it("should return correct name", async () => {
      expect(await call(jToken, "name")).toEqual("JToken Foo");
    });

    it("should return correct symbol", async () => {
      expect(await call(jToken, "symbol")).toEqual("cFOO");
    });

    it("should return correct decimals", async () => {
      expect(await call(jToken, "decimals")).toEqualNumber(10);
    });
  });

  describe("balanceOfUnderlying", () => {
    it("has an underlying balance", async () => {
      const jToken = await makeJToken({ supportMarket: true, exchangeRate: 2 });
      await send(jToken, "harnessSetBalance", [root, 100]);
      expect(await call(jToken, "balanceOfUnderlying", [root])).toEqualNumber(
        200
      );
    });
  });

  describe("borrowRatePerSecond", () => {
    it("has a borrow rate", async () => {
      const jToken = await makeJToken({
        supportMarket: true,
        interestRateModelOpts: {
          kind: "jump-rate",
          baseRate: 0.05,
          multiplier: 0.45,
          kink: 0.95,
          jump: 5,
          roof: 1,
        },
      });
      const perSecond = await call(jToken, "borrowRatePerSecond");
      expect(Math.abs(perSecond * 31536000 - 5e16)).toBeLessThanOrEqual(1e8);
    });
  });

  describe("supplyRatePerSecond", () => {
    it("returns 0 if there's no supply", async () => {
      const jToken = await makeJToken({
        supportMarket: true,
        interestRateModelOpts: {
          kind: "jump-rate",
          baseRate: 0.05,
          multiplier: 0.45,
          kink: 0.95,
          jump: 5,
          roof: 1,
        },
      });
      const perSecond = await call(jToken, "supplyRatePerSecond");
      await expect(perSecond).toEqualNumber(0);
    });

    it("has a supply rate", async () => {
      const baseRate = 0.05;
      const multiplier = 0.45;
      const kink = 0.95;
      const jump = 5 * multiplier;
      const roof = 1;
      const jToken = await makeJToken({
        supportMarket: true,
        interestRateModelOpts: {
          kind: "jump-rate",
          baseRate,
          multiplier: multiplier * kink,
          kink,
          jump,
          roof,
        },
      });
      await send(jToken, "harnessSetReserveFactorFresh", [avaxMantissa(0.01)]);
      await send(jToken, "harnessExchangeRateDetails", [1, 1, 0]);
      await send(jToken, "harnessSetExchangeRate", [avaxMantissa(1)]);
      // Full utilization (Over the kink so jump is included), 1% reserves
      const borrowRate = baseRate + multiplier * kink + jump * 0.05;
      const expectedSuplyRate = borrowRate * 0.99;

      const perSecond = await call(jToken, "supplyRatePerSecond");
      expect(
        Math.abs(perSecond * 31536000 - expectedSuplyRate * 1e18)
      ).toBeLessThanOrEqual(1e8);
    });
  });

  describe("borrowBalanceCurrent", () => {
    let borrower;
    let jToken;

    beforeEach(async () => {
      borrower = accounts[0];
      jToken = await makeJToken();
    });

    beforeEach(async () => {
      await setBorrowRate(jToken, 0.001);
      await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
    });

    it("reverts if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      // make sure we accrue interest
      await send(jToken, "harnessFastForward", [1]);
      await expect(
        send(jToken, "borrowBalanceCurrent", [borrower])
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns successful result from borrowBalanceStored with no interest", async () => {
      await setBorrowRate(jToken, 0);
      await pretendBorrow(jToken, borrower, 1, 1, 5e18);
      expect(
        await call(jToken, "borrowBalanceCurrent", [borrower])
      ).toEqualNumber(5e18);
    });

    it("returns successful result from borrowBalanceCurrent with no interest", async () => {
      await setBorrowRate(jToken, 0);
      await pretendBorrow(jToken, borrower, 1, 3, 5e18);
      expect(await send(jToken, "harnessFastForward", [5])).toSucceed();
      expect(
        await call(jToken, "borrowBalanceCurrent", [borrower])
      ).toEqualNumber(5e18 * 3);
    });
  });

  describe("borrowBalanceStored", () => {
    let borrower;
    let jToken;

    beforeEach(async () => {
      borrower = accounts[0];
      jToken = await makeJToken({ joetrollerOpts: { kind: "bool" } });
    });

    it("returns 0 for account with no borrows", async () => {
      expect(
        await call(jToken, "borrowBalanceStored", [borrower])
      ).toEqualNumber(0);
    });

    it("returns stored principal when account and market indexes are the same", async () => {
      await pretendBorrow(jToken, borrower, 1, 1, 5e18);
      expect(
        await call(jToken, "borrowBalanceStored", [borrower])
      ).toEqualNumber(5e18);
    });

    it("returns calculated balance when market index is higher than account index", async () => {
      await pretendBorrow(jToken, borrower, 1, 3, 5e18);
      expect(
        await call(jToken, "borrowBalanceStored", [borrower])
      ).toEqualNumber(5e18 * 3);
    });

    it("has undefined behavior when market index is lower than account index", async () => {
      // The market index < account index should NEVER happen, so we don't test this case
    });

    it("reverts on overflow of principal", async () => {
      await pretendBorrow(jToken, borrower, 1, 3, UInt256Max());
      await expect(
        call(jToken, "borrowBalanceStored", [borrower])
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("reverts on non-zero stored principal with zero account index", async () => {
      await pretendBorrow(jToken, borrower, 0, 3, 5);
      await expect(
        call(jToken, "borrowBalanceStored", [borrower])
      ).rejects.toRevert("revert divide by zero");
    });
  });

  describe("exchangeRateStored", () => {
    let jToken,
      exchangeRate = 2;

    beforeEach(async () => {
      jToken = await makeJToken({ exchangeRate });
    });

    it("returns initial exchange rate with zero jTokenSupply", async () => {
      const result = await call(jToken, "exchangeRateStored");
      expect(result).toEqualNumber(avaxMantissa(exchangeRate));
    });

    it("calculates with single jTokenSupply and single total borrow", async () => {
      const jTokenSupply = 1,
        totalBorrows = 1,
        totalReserves = 0;
      await send(jToken, "harnessExchangeRateDetails", [
        jTokenSupply,
        totalBorrows,
        totalReserves,
      ]);
      const result = await call(jToken, "exchangeRateStored");
      expect(result).toEqualNumber(avaxMantissa(1));
    });

    it("calculates with jTokenSupply and total borrows", async () => {
      const jTokenSupply = 100e18,
        totalBorrows = 10e18,
        totalReserves = 0;
      await send(
        jToken,
        "harnessExchangeRateDetails",
        [jTokenSupply, totalBorrows, totalReserves].map(avaxUnsigned)
      );
      const result = await call(jToken, "exchangeRateStored");
      expect(result).toEqualNumber(avaxMantissa(0.1));
    });

    it("calculates with cash and jTokenSupply", async () => {
      const jTokenSupply = 5e18,
        totalBorrows = 0,
        totalReserves = 0;
      expect(
        await send(jToken.underlying, "transfer", [
          jToken._address,
          avaxMantissa(500),
        ])
      ).toSucceed();
      await send(
        jToken,
        "harnessExchangeRateDetails",
        [jTokenSupply, totalBorrows, totalReserves].map(avaxUnsigned)
      );
      const result = await call(jToken, "exchangeRateStored");
      expect(result).toEqualNumber(avaxMantissa(100));
    });

    it("calculates with cash, borrows, reserves and jTokenSupply", async () => {
      const jTokenSupply = 500e18,
        totalBorrows = 500e18,
        totalReserves = 5e18;
      expect(
        await send(jToken.underlying, "transfer", [
          jToken._address,
          avaxMantissa(500),
        ])
      ).toSucceed();
      await send(
        jToken,
        "harnessExchangeRateDetails",
        [jTokenSupply, totalBorrows, totalReserves].map(avaxUnsigned)
      );
      const result = await call(jToken, "exchangeRateStored");
      expect(result).toEqualNumber(avaxMantissa(1.99));
    });
  });

  describe("getCash", () => {
    it("gets the cash", async () => {
      const jToken = await makeJToken();
      const result = await call(jToken, "getCash");
      expect(result).toEqualNumber(0);
    });
  });
});
