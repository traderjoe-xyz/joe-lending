const {
  avaxMantissa,
  avaxUnsigned,
  UInt256Max,
} = require("../Utils/Avalanche");
const { makeJToken, setBorrowRate } = require("../Utils/BankerJoe");

const blockTimestamp = 2e7;
const borrowIndex = 1e18;
const borrowRate = 0.000001;

async function pretendTimestamp(
  jToken,
  accrualBlockTimestamp = blockTimestamp,
  deltaTimestamp = 1
) {
  await send(jToken, "harnessSetAccrualBlockTimestamp", [
    avaxUnsigned(blockTimestamp),
  ]);
  await send(jToken, "harnessSetBlockTimestamp", [
    avaxUnsigned(blockTimestamp + deltaTimestamp),
  ]);
  await send(jToken, "harnessSetBorrowIndex", [avaxUnsigned(borrowIndex)]);
}

async function preAccrue(jToken) {
  await setBorrowRate(jToken, borrowRate);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken, "harnessExchangeRateDetails", [0, 0, 0]);
}

describe("JToken", () => {
  let root, accounts;
  let jToken;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    jToken = await makeJToken({ joetrollerOpts: { kind: "bool" } });
  });

  beforeEach(async () => {
    await preAccrue(jToken);
  });

  describe("accrueInterest", () => {
    it("reverts if the interest rate is absurdly high", async () => {
      await pretendTimestamp(jToken, blockTimestamp, 1);
      expect(await call(jToken, "getBorrowRateMaxMantissa")).toEqualNumber(
        avaxMantissa(0.000005)
      ); // 0.0005% per block
      await setBorrowRate(jToken, 0.001e-2); // 0.0010% per block
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert borrow rate is absurdly high"
      );
    });

    it("fails if new borrow rate calculation fails", async () => {
      await pretendTimestamp(jToken, blockTimestamp, 1);
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert INTEREST_RATE_MODEL_ERROR"
      );
    });

    it("fails if simple interest factor calculation fails", async () => {
      await pretendTimestamp(jToken, blockTimestamp, 5e70);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert multiplication overflow"
      );
    });

    it("fails if new borrow index calculation fails", async () => {
      await pretendTimestamp(jToken, blockTimestamp, 5e60);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert multiplication overflow"
      );
    });

    it("fails if new borrow interest index calculation fails", async () => {
      await pretendTimestamp(jToken);
      await send(jToken, "harnessSetBorrowIndex", [UInt256Max()]);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert multiplication overflow"
      );
    });

    it("fails if interest accumulated calculation fails", async () => {
      await send(jToken, "harnessExchangeRateDetails", [0, UInt256Max(), 0]);
      await pretendTimestamp(jToken);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert multiplication overflow"
      );
    });

    it("fails if new total borrows calculation fails", async () => {
      await setBorrowRate(jToken, 1e-18);
      await pretendTimestamp(jToken);
      await send(jToken, "harnessExchangeRateDetails", [0, UInt256Max(), 0]);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert addition overflow"
      );
    });

    it("fails if interest accumulated for reserves calculation fails", async () => {
      await setBorrowRate(jToken, 0.000001);
      await send(jToken, "harnessExchangeRateDetails", [
        0,
        avaxUnsigned(1e30),
        UInt256Max(),
      ]);
      await send(jToken, "harnessSetReserveFactorFresh", [avaxUnsigned(1e10)]);
      await pretendTimestamp(jToken, blockTimestamp, 5e20);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert addition overflow"
      );
    });

    it("fails if new total reserves calculation fails", async () => {
      await setBorrowRate(jToken, 1e-18);
      await send(jToken, "harnessExchangeRateDetails", [
        0,
        avaxUnsigned(1e56),
        UInt256Max(),
      ]);
      await send(jToken, "harnessSetReserveFactorFresh", [avaxUnsigned(1e17)]);
      await pretendTimestamp(jToken);
      await expect(send(jToken, "accrueInterest")).rejects.toRevert(
        "revert addition overflow"
      );
    });

    it("succeeds and saves updated values in storage on success", async () => {
      const startingTotalBorrows = 1e22;
      const startingTotalReserves = 1e20;
      const reserveFactor = 1e17;

      await send(jToken, "harnessExchangeRateDetails", [
        0,
        avaxUnsigned(startingTotalBorrows),
        avaxUnsigned(startingTotalReserves),
      ]);
      await send(jToken, "harnessSetReserveFactorFresh", [
        avaxUnsigned(reserveFactor),
      ]);
      await pretendTimestamp(jToken);

      const expectedAccrualBlockTimestamp = blockTimestamp + 1;
      const expectedBorrowIndex = borrowIndex + borrowIndex * borrowRate;
      const expectedTotalBorrows =
        startingTotalBorrows + startingTotalBorrows * borrowRate;
      const expectedTotalReserves =
        startingTotalReserves +
        (startingTotalBorrows * borrowRate * reserveFactor) / 1e18;

      const receipt = await send(jToken, "accrueInterest");
      expect(receipt).toSucceed();
      expect(receipt).toHaveLog("AccrueInterest", {
        cashPrior: 0,
        interestAccumulated: avaxUnsigned(expectedTotalBorrows)
          .minus(avaxUnsigned(startingTotalBorrows))
          .toFixed(),
        borrowIndex: avaxUnsigned(expectedBorrowIndex).toFixed(),
        totalBorrows: avaxUnsigned(expectedTotalBorrows).toFixed(),
      });
      expect(await call(jToken, "accrualBlockTimestamp")).toEqualNumber(
        expectedAccrualBlockTimestamp
      );
      expect(await call(jToken, "borrowIndex")).toEqualNumber(
        expectedBorrowIndex
      );
      expect(await call(jToken, "totalBorrows")).toEqualNumber(
        expectedTotalBorrows
      );
      expect(await call(jToken, "totalReserves")).toEqualNumber(
        expectedTotalReserves
      );
    });
  });
});
