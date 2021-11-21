const {
  avaxUnsigned,
  avaxMantissa,
  UInt256Max,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  balanceOf,
  borrowSnapshot,
  totalBorrows,
  fastForward,
  setBalance,
  preApprove,
  pretendBorrow,
} = require("../Utils/BankerJoe");

const borrowAmount = avaxUnsigned(10e3);
const repayAmount = avaxUnsigned(10e2);

async function preBorrow(jToken, borrower, borrowAmount) {
  await send(jToken.joetroller, "setBorrowAllowed", [true]);
  await send(jToken.joetroller, "setBorrowVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken.underlying, "harnessSetBalance", [
    jToken._address,
    borrowAmount,
  ]);
  await send(jToken, "harnessSetFailTransferToAddress", [borrower, false]);
  await send(jToken, "harnessSetAccountBorrows", [borrower, 0, 0]);
  await send(jToken, "harnessSetTotalBorrows", [0]);
}

async function borrowFresh(jToken, borrower, borrowAmount) {
  return send(jToken, "harnessBorrowFresh", [borrower, borrowAmount]);
}

async function borrow(jToken, borrower, borrowAmount, opts = {}) {
  // make sure to have a block delta so we accrue interest
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "borrow", [borrowAmount], { from: borrower });
}

async function preRepay(jToken, benefactor, borrower, repayAmount) {
  // setup either benefactor OR borrower for success in repaying
  await send(jToken.joetroller, "setRepayBorrowAllowed", [true]);
  await send(jToken.joetroller, "setRepayBorrowVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken.underlying, "harnessSetFailTransferFromAddress", [
    benefactor,
    false,
  ]);
  await send(jToken.underlying, "harnessSetFailTransferFromAddress", [
    borrower,
    false,
  ]);
  await pretendBorrow(jToken, borrower, 1, 1, repayAmount);
  await preApprove(jToken, benefactor, repayAmount);
  await preApprove(jToken, borrower, repayAmount);
}

async function repayBorrowFresh(jToken, payer, borrower, repayAmount) {
  return send(
    jToken,
    "harnessRepayBorrowFresh",
    [payer, borrower, repayAmount],
    { from: payer }
  );
}

async function repayBorrow(jToken, borrower, repayAmount) {
  // make sure to have a block delta so we accrue interest
  await send(jToken, "harnessFastForward", [1]);
  return send(jToken, "repayBorrow", [repayAmount], { from: borrower });
}

describe("JToken", function () {
  let jToken, root, borrower, benefactor, accounts;
  beforeEach(async () => {
    [root, borrower, benefactor, ...accounts] = saddle.accounts;
    jToken = await makeJToken({ joetrollerOpts: { kind: "bool" } });
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

    it("fails if error if protocol has less than borrowAmount of underlying", async () => {
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

    xit("reverts if borrowVerify fails", async () => {
      await send(jToken.joetroller, "setBorrowVerify", [false]);
      await expect(
        borrowFresh(jToken, borrower, borrowAmount)
      ).rejects.toRevert("revert borrowVerify rejected borrow");
    });

    it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
      const beforeProtocolCash = await balanceOf(
        jToken.underlying,
        jToken._address
      );
      const beforeProtocolBorrows = await totalBorrows(jToken);
      const beforeAccountCash = await balanceOf(jToken.underlying, borrower);
      const result = await borrowFresh(jToken, borrower, borrowAmount);
      expect(result).toSucceed();
      expect(await balanceOf(jToken.underlying, borrower)).toEqualNumber(
        beforeAccountCash.plus(borrowAmount)
      );
      expect(await balanceOf(jToken.underlying, jToken._address)).toEqualNumber(
        beforeProtocolCash.minus(borrowAmount)
      );
      expect(await totalBorrows(jToken)).toEqualNumber(
        beforeProtocolBorrows.plus(borrowAmount)
      );
      expect(result).toHaveLog("Transfer", {
        from: jToken._address,
        to: borrower,
        amount: borrowAmount.toString(),
      });
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

  describe("borrow", () => {
    beforeEach(async () => await preBorrow(jToken, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(borrow(jToken, borrower, borrowAmount)).rejects.toRevert(
        "revert INTEREST_RATE_MODEL_ERROR"
      );
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      expect(
        await borrow(jToken, borrower, borrowAmount.plus(1))
      ).toHaveTokenFailure(
        "TOKEN_INSUFFICIENT_CASH",
        "BORROW_CASH_NOT_AVAILABLE"
      );
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeAccountCash = await balanceOf(jToken.underlying, borrower);
      await fastForward(jToken);
      expect(await borrow(jToken, borrower, borrowAmount)).toSucceed();
      expect(await balanceOf(jToken.underlying, borrower)).toEqualNumber(
        beforeAccountCash.plus(borrowAmount)
      );
    });
  });

  describe("repayBorrowFresh", () => {
    [true, false].forEach((benefactorIsPayer) => {
      let payer;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
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

        it("fails if insufficient approval", async () => {
          await preApprove(jToken, payer, 1);
          await expect(
            repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).rejects.toRevert("revert Insufficient allowance");
        });

        it("fails if insufficient balance", async () => {
          await setBalance(jToken.underlying, payer, 1);
          await expect(
            repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).rejects.toRevert("revert Insufficient balance");
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

        it("reverts if doTransferIn fails", async () => {
          await send(jToken.underlying, "harnessSetFailTransferFromAddress", [
            payer,
            true,
          ]);
          await expect(
            repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).rejects.toRevert("revert TOKEN_TRANSFER_IN_FAILED");
        });

        xit("reverts if repayBorrowVerify fails", async () => {
          await send(jToken.joetroller, "setRepayBorrowVerify", [false]);
          await expect(
            repayBorrowFresh(jToken, payer, borrower, repayAmount)
          ).rejects.toRevert("revert repayBorrowVerify rejected repayBorrow");
        });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await balanceOf(
            jToken.underlying,
            jToken._address
          );
          const result = await repayBorrowFresh(
            jToken,
            payer,
            borrower,
            repayAmount
          );
          expect(
            await balanceOf(jToken.underlying, jToken._address)
          ).toEqualNumber(beforeProtocolCash.plus(repayAmount));
          expect(result).toHaveLog("Transfer", {
            from: payer,
            to: jToken._address,
            amount: repayAmount.toString(),
          });
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

  describe("repayBorrow", () => {
    beforeEach(async () => {
      await preRepay(jToken, borrower, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(repayBorrow(jToken, borrower, repayAmount)).rejects.toRevert(
        "revert INTEREST_RATE_MODEL_ERROR"
      );
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await setBalance(jToken.underlying, borrower, 1);
      await expect(repayBorrow(jToken, borrower, repayAmount)).rejects.toRevert(
        "revert Insufficient balance"
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

    it("repays the full amount owed if payer has enough", async () => {
      await fastForward(jToken);
      expect(await repayBorrow(jToken, borrower, UInt256Max())).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(jToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await setBalance(jToken.underlying, borrower, 3);
      await fastForward(jToken);
      await expect(
        repayBorrow(jToken, borrower, UInt256Max())
      ).rejects.toRevert("revert Insufficient balance");
    });
  });
});
