const {
  avaxGasCost,
  avaxUnsigned,
  avaxMantissa,
  UInt256Max,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  borrowSnapshot,
  totalBorrows,
  fastForward,
  pretendBorrow,
  getBalances,
  adjustBalances,
} = require("../Utils/BankerJoe");

const BigNumber = require("bignumber.js");

const borrowAmount = avaxUnsigned(10e3);
const repayAmount = avaxUnsigned(10e2);

async function preBorrow(jToken, borrower, borrowAmount) {
  const root = saddle.account;
  await send(jToken.joetroller, "setBorrowAllowed", [true]);
  await send(jToken.joetroller, "setBorrowVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken, "harnessSetFailTransferToAddress", [borrower, false]);
  await send(jToken, "harnessSetAccountBorrows", [borrower, 0, 0]);
  await send(jToken, "harnessSetTotalBorrows", [0]);
  await send(jToken.underlying, "deposit", [], {
    from: root,
    value: borrowAmount,
  });
  await send(jToken.underlying, "harnessSetBalance", [
    jToken._address,
    borrowAmount,
  ]);
}

async function borrowFresh(jToken, borrower, borrowAmount) {
  return send(jToken, "harnessBorrowFresh", [borrower, borrowAmount], {
    from: borrower,
  });
}

async function borrowNative(jToken, borrower, borrowAmount, opts = {}) {
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "borrowNative", [borrowAmount], { from: borrower });
}

async function borrow(jToken, borrower, borrowAmount, opts = {}) {
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "borrow", [borrowAmount], { from: borrower });
}

async function preRepay(jToken, benefactor, borrower, repayAmount) {
  // setup either benefactor OR borrower for success in repaying
  await send(jToken.joetroller, "setRepayBorrowAllowed", [true]);
  await send(jToken.joetroller, "setRepayBorrowVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await pretendBorrow(jToken, borrower, 1, 1, repayAmount);
}

async function repayBorrowFresh(jToken, payer, borrower, repayAmount) {
  return send(
    jToken,
    "harnessRepayBorrowFresh",
    [payer, borrower, repayAmount],
    { from: payer, value: repayAmount }
  );
}

async function repayBorrowNative(jToken, borrower, repayAmount) {
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "repayBorrowNative", [], {
    from: borrower,
    value: repayAmount,
  });
}

async function repayBorrow(jToken, borrower, repayAmount) {
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "repayBorrow", [repayAmount], { from: borrower });
}

async function repayBorrowBehalfNative(jToken, payer, borrower, repayAmount) {
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "repayBorrowBehalfNative", [borrower], {
    from: payer,
    value: repayAmount,
  });
}

describe("CWrappedNative", function () {
  let jToken, root, borrower, benefactor, accounts;
  beforeEach(async () => {
    [root, borrower, benefactor, ...accounts] = saddle.accounts;
    jToken = await makeJToken({
      kind: "jwrapped",
      joetrollerOpts: { kind: "bool" },
    });
  });

  describe("borrowFresh", () => {
    beforeEach(async () => await preBorrow(jToken, borrower, borrowAmount));

    it("fails if joetroller tells it to", async () => {
      await send(jToken.joetroller, "setBorrowAllowed", [false]);
      expect(
        await borrowFresh(jToken, borrower, borrowAmount)
      ).toHaveTrollReject("BORROW_JOETROLLER_REJECTION");
    });

    it("proceeds if joetroller tells it to", async () => {
      await expect(
        await borrowFresh(jToken, borrower, borrowAmount)
      ).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await fastForward(jToken);
      expect(
        await borrowFresh(jToken, borrower, borrowAmount)
      ).toHaveTokenFailure("MARKET_NOT_FRESH", "BORROW_FRESHNESS_CHECK");
    });

    it("continues if fresh", async () => {
      await expect(await send(jToken, "accrueInterest")).toSucceed();
      await expect(
        await borrowFresh(jToken, borrower, borrowAmount)
      ).toSucceed();
    });

    it("fails if protocol has less than borrowAmount of underlying", async () => {
      expect(
        await borrowFresh(jToken, borrower, borrowAmount.plus(1))
      ).toHaveTokenFailure(
        "TOKEN_INSUFFICIENT_CASH",
        "BORROW_CASH_NOT_AVAILABLE"
      );
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(jToken, borrower, 0, 3e18, 5e18);
      await expect(
        borrowFresh(jToken, borrower, borrowAmount)
      ).rejects.toRevert("revert divide by zero");
    });

    it("fails if calculating account new total borrow balance overflows", async () => {
      await pretendBorrow(jToken, borrower, 1e-18, 1e-18, UInt256Max());
      await expect(
        borrowFresh(jToken, borrower, borrowAmount)
      ).rejects.toRevert("revert addition overflow");
    });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await send(jToken, "harnessSetTotalBorrows", [UInt256Max()]);
      await expect(
        borrowFresh(jToken, borrower, borrowAmount)
      ).rejects.toRevert("revert addition overflow");
    });

    it("reverts if transfer out fails", async () => {
      await send(jToken, "harnessSetFailTransferToAddress", [borrower, true]);
      await expect(
        borrowFresh(jToken, borrower, borrowAmount)
      ).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
    });

    it("transfers the underlying cash, tokens, and emits Borrow event", async () => {
      const beforeBalances = await getBalances([jToken], [borrower]);
      const beforeProtocolBorrows = await totalBorrows(jToken);
      const result = await borrowFresh(jToken, borrower, borrowAmount);
      const afterBalances = await getBalances([jToken], [borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "borrows", borrowAmount],
          [jToken, "cash", -borrowAmount],
          [
            jToken,
            borrower,
            "avax",
            borrowAmount.minus(await avaxGasCost(result)),
          ],
          [jToken, borrower, "borrows", borrowAmount],
        ])
      );
      expect(result).toHaveLog("Borrow", {
        borrower: borrower,
        borrowAmount: borrowAmount.toString(),
        accountBorrows: borrowAmount.toString(),
        totalBorrows: beforeProtocolBorrows.plus(borrowAmount).toString(),
      });
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await totalBorrows(jToken);
      await pretendBorrow(jToken, borrower, 0, 3, 0);
      await borrowFresh(jToken, borrower, borrowAmount);
      const borrowSnap = await borrowSnapshot(jToken, borrower);
      expect(borrowSnap.principal).toEqualNumber(borrowAmount);
      expect(borrowSnap.interestIndex).toEqualNumber(avaxMantissa(3));
      expect(await totalBorrows(jToken)).toEqualNumber(
        beforeProtocolBorrows.plus(borrowAmount)
      );
    });
  });

  describe("borrowNative", () => {
    beforeEach(async () => await preBorrow(jToken, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await send(jToken, "harnessFastForward", [1]);
      await expect(
        borrowNative(jToken, borrower, borrowAmount)
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("reverts if error returned from borrowFresh", async () => {
      await expect(
        borrowNative(jToken, borrower, borrowAmount.plus(1))
      ).rejects.toRevert("revert borrow native failed");
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeBalances = await getBalances([jToken], [borrower]);
      await fastForward(jToken);
      const result = await borrowNative(jToken, borrower, borrowAmount);
      const afterBalances = await getBalances([jToken], [borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "borrows", borrowAmount],
          [jToken, "cash", -borrowAmount],
          [
            jToken,
            borrower,
            "avax",
            borrowAmount.minus(await avaxGasCost(result)),
          ],
          [jToken, borrower, "borrows", borrowAmount],
        ])
      );
    });
  });

  describe("borrow", () => {
    beforeEach(async () => await preBorrow(jToken, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await send(jToken, "harnessFastForward", [1]);
      await expect(borrow(jToken, borrower, borrowAmount)).rejects.toRevert(
        "revert INTEREST_RATE_MODEL_ERROR"
      );
    });

    it("reverts if error returned from borrowFresh", async () => {
      await expect(
        borrow(jToken, borrower, borrowAmount.plus(1))
      ).rejects.toRevert("revert borrow failed");
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeBalances = await getBalances([jToken], [borrower]);
      await fastForward(jToken);
      const result = await borrow(jToken, borrower, borrowAmount);
      const afterBalances = await getBalances([jToken], [borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "borrows", borrowAmount],
          [jToken, "cash", -borrowAmount],
          [jToken, borrower, "cash", borrowAmount],
          [jToken, borrower, "avax", -(await avaxGasCost(result))],
          [jToken, borrower, "borrows", borrowAmount],
        ])
      );
    });
  });

  describe("repayBorrowFresh", () => {
    [true, false].forEach(async (benefactorPaying) => {
      let payer;
      const label = benefactorPaying ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorPaying ? benefactor : borrower;

          await preRepay(jToken, payer, borrower, repayAmount);
        });

        it("fails if repay is not allowed", async () => {
          await send(jToken.joetroller, "setRepayBorrowAllowed", [false]);
          expect(
            await repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).toHaveTrollReject(
            "REPAY_BORROW_JOETROLLER_REJECTION",
            "MATH_ERROR"
          );
        });

        it("fails if block number ≠ current block number", async () => {
          await fastForward(jToken);
          expect(
            await repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).toHaveTokenFailure(
            "MARKET_NOT_FRESH",
            "REPAY_BORROW_FRESHNESS_CHECK"
          );
        });

        it("returns an error if calculating account new account borrow balance fails", async () => {
          await pretendBorrow(jToken, borrower, 1, 1, 1);
          await expect(
            repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).rejects.toRevert("revert subtraction underflow");
        });

        it("returns an error if calculation of new total borrow balance fails", async () => {
          await send(jToken, "harnessSetTotalBorrows", [1]);
          await expect(
            repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).rejects.toRevert("revert subtraction underflow");
        });

        it("reverts if checkTransferIn fails", async () => {
          await expect(
            send(
              jToken,
              "harnessRepayBorrowFresh",
              [payer, borrower, repayAmount],
              { from: root, value: repayAmount }
            )
          ).rejects.toRevert("revert sender mismatch");
          await expect(
            send(
              jToken,
              "harnessRepayBorrowFresh",
              [payer, borrower, repayAmount],
              { from: payer, value: 1 }
            )
          ).rejects.toRevert("revert value mismatch");
        });

        it("transfers the underlying cash, and emits RepayBorrow event", async () => {
          const beforeBalances = await getBalances([jToken], [borrower]);
          const result = await repayBorrowFresh(
            jToken,
            payer,
            borrower,
            repayAmount
          );
          const afterBalances = await getBalances([jToken], [borrower]);
          expect(result).toSucceed();
          if (borrower == payer) {
            expect(afterBalances).toEqual(
              await adjustBalances(beforeBalances, [
                [jToken, "borrows", -repayAmount],
                [jToken, "cash", repayAmount],
                [jToken, borrower, "borrows", -repayAmount],
                [
                  jToken,
                  borrower,
                  "avax",
                  -repayAmount.plus(await avaxGasCost(result)),
                ],
              ])
            );
          } else {
            expect(afterBalances).toEqual(
              await adjustBalances(beforeBalances, [
                [jToken, "borrows", -repayAmount],
                [jToken, "cash", repayAmount],
                [jToken, borrower, "borrows", -repayAmount],
              ])
            );
          }
          expect(result).toHaveLog("RepayBorrow", {
            payer: payer,
            borrower: borrower,
            repayAmount: repayAmount.toString(),
            accountBorrows: "0",
            totalBorrows: "0",
          });
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await totalBorrows(jToken);
          const beforeAccountBorrowSnap = await borrowSnapshot(
            jToken,
            borrower
          );
          expect(
            await repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).toSucceed();
          const afterAccountBorrows = await borrowSnapshot(jToken, borrower);
          expect(afterAccountBorrows.principal).toEqualNumber(
            beforeAccountBorrowSnap.principal.minus(repayAmount)
          );
          expect(afterAccountBorrows.interestIndex).toEqualNumber(
            avaxMantissa(1)
          );
          expect(await totalBorrows(jToken)).toEqualNumber(
            beforeProtocolBorrows.minus(repayAmount)
          );
        });
      });
    });
  });

  describe("repayBorrowNative", () => {
    beforeEach(async () => {
      await preRepay(jToken, borrower, borrower, repayAmount);
    });

    it("reverts if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(
        repayBorrowNative(jToken, borrower, repayAmount)
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("reverts when repay borrow fresh fails", async () => {
      await send(jToken.joetroller, "setRepayBorrowAllowed", [false]);
      await expect(
        repayBorrowNative(jToken, borrower, repayAmount)
      ).rejects.toRevert("revert repay native failed");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await fastForward(jToken);
      const beforeAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      expect(
        await repayBorrowNative(jToken, borrower, repayAmount)
      ).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(
        beforeAccountBorrowSnap.principal.minus(repayAmount)
      );
    });

    it("reverts if overpaying", async () => {
      const beforeAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      let tooMuch = new BigNumber(beforeAccountBorrowSnap.principal).plus(1);
      await expect(
        repayBorrowNative(jToken, borrower, tooMuch)
      ).rejects.toRevert("revert subtraction underflow");
    });
  });

  describe("repayBorrow", () => {
    beforeEach(async () => {
      await preRepay(jToken, borrower, borrower, repayAmount);

      // Give some wavax to borrower for repayment.
      await send(jToken.underlying, "deposit", [], {
        from: borrower,
        value: repayAmount.multipliedBy(2),
      });
      await send(
        jToken.underlying,
        "approve",
        [jToken._address, repayAmount.multipliedBy(2)],
        { from: borrower }
      );
    });

    it("reverts if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(repayBorrow(jToken, borrower, repayAmount)).rejects.toRevert(
        "revert INTEREST_RATE_MODEL_ERROR"
      );
    });

    it("reverts when repay borrow fresh fails", async () => {
      await send(jToken.joetroller, "setRepayBorrowAllowed", [false]);
      await expect(repayBorrow(jToken, borrower, repayAmount)).rejects.toRevert(
        "revert repay failed"
      );
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await fastForward(jToken);
      const beforeAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      expect(await repayBorrow(jToken, borrower, repayAmount)).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(
        beforeAccountBorrowSnap.principal.minus(repayAmount)
      );
    });

    it("reverts if overpaying", async () => {
      const beforeAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      let tooMuch = new BigNumber(beforeAccountBorrowSnap.principal).plus(1);
      await expect(repayBorrow(jToken, borrower, tooMuch)).rejects.toRevert(
        "revert subtraction underflow"
      );
    });
  });
});
