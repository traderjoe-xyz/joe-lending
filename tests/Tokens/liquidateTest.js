const { avaxGasCost, avaxUnsigned, UInt256Max } = require("../Utils/Avalanche");

const {
  makeJToken,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  pretendBorrow,
  preApprove,
} = require("../Utils/BankerJoe");

const repayAmount = avaxUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.multipliedBy(4); // forced

async function preLiquidate(
  jToken,
  liquidator,
  borrower,
  repayAmount,
  jTokenCollateral
) {
  // setup for success in liquidating
  await send(jToken.joetroller, "setLiquidateBorrowAllowed", [true]);
  await send(jToken.joetroller, "setLiquidateBorrowVerify", [true]);
  await send(jToken.joetroller, "setRepayBorrowAllowed", [true]);
  await send(jToken.joetroller, "setRepayBorrowVerify", [true]);
  await send(jToken.joetroller, "setSeizeAllowed", [true]);
  await send(jToken.joetroller, "setSeizeVerify", [true]);
  await send(jToken.joetroller, "setFailCalculateSeizeTokens", [false]);
  await send(jToken.underlying, "harnessSetFailTransferFromAddress", [
    liquidator,
    false,
  ]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jTokenCollateral.interestRateModel, "setFailBorrowRate", [false]);
  await send(jTokenCollateral.joetroller, "setCalculatedSeizeTokens", [
    seizeTokens,
  ]);
  await setBalance(jTokenCollateral, liquidator, 0);
  await setBalance(jTokenCollateral, borrower, seizeTokens);
  await pretendBorrow(jTokenCollateral, borrower, 0, 1, 0);
  await pretendBorrow(jToken, borrower, 1, 1, repayAmount);
  await preApprove(jToken, liquidator, repayAmount);
}

async function liquidateFresh(
  jToken,
  liquidator,
  borrower,
  repayAmount,
  jTokenCollateral
) {
  return send(jToken, "harnessLiquidateBorrowFresh", [
    liquidator,
    borrower,
    repayAmount,
    jTokenCollateral._address,
  ]);
}

async function liquidate(
  jToken,
  liquidator,
  borrower,
  repayAmount,
  jTokenCollateral
) {
  // make sure to have a block delta so we accrue interest
  await fastForward(jToken, 1);
  await fastForward(jTokenCollateral, 1);
  return send(
    jToken,
    "liquidateBorrow",
    [borrower, repayAmount, jTokenCollateral._address],
    { from: liquidator }
  );
}

async function seize(jToken, liquidator, borrower, seizeAmount) {
  return send(jToken, "seize", [liquidator, borrower, seizeAmount]);
}

describe("JToken", function () {
  let root, liquidator, borrower, accounts;
  let jToken, jTokenCollateral;

  beforeEach(async () => {
    [root, liquidator, borrower, ...accounts] = saddle.accounts;
    jToken = await makeJToken({ joetrollerOpts: { kind: "bool" } });
    jTokenCollateral = await makeJToken({ joetroller: jToken.joetroller });
  });

  beforeEach(async () => {
    await preLiquidate(
      jToken,
      liquidator,
      borrower,
      repayAmount,
      jTokenCollateral
    );
  });

  describe("liquidateBorrowFresh", () => {
    it("fails if joetroller tells it to", async () => {
      await send(jToken.joetroller, "setLiquidateBorrowAllowed", [false]);
      expect(
        await liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).toHaveTrollReject("LIQUIDATE_JOETROLLER_REJECTION", "MATH_ERROR");
    });

    it("proceeds if joetroller tells it to", async () => {
      expect(
        await liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await fastForward(jToken);
      expect(
        await liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).toHaveTokenFailure("MARKET_NOT_FRESH", "LIQUIDATE_FRESHNESS_CHECK");
    });

    it("fails if collateral market not fresh", async () => {
      await fastForward(jToken);
      await fastForward(jTokenCollateral);
      await send(jToken, "accrueInterest");
      expect(
        await liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).toHaveTokenFailure(
        "MARKET_NOT_FRESH",
        "LIQUIDATE_COLLATERAL_FRESHNESS_CHECK"
      );
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(
        await liquidateFresh(
          jToken,
          borrower,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).toHaveTokenFailure(
        "INVALID_ACCOUNT_PAIR",
        "LIQUIDATE_LIQUIDATOR_IS_BORROWER"
      );
    });

    it("fails if repayAmount = 0", async () => {
      expect(
        await liquidateFresh(jToken, liquidator, borrower, 0, jTokenCollateral)
      ).toHaveTokenFailure(
        "INVALID_CLOSE_AMOUNT_REQUESTED",
        "LIQUIDATE_CLOSE_AMOUNT_IS_ZERO"
      );
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const beforeBalances = await getBalances(
        [jToken, jTokenCollateral],
        [liquidator, borrower]
      );
      await send(jToken.joetroller, "setFailCalculateSeizeTokens", [true]);
      await expect(
        liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).rejects.toRevert(
        "revert LIQUIDATE_JOETROLLER_CALCULATE_AMOUNT_SEIZE_FAILED"
      );
      const afterBalances = await getBalances(
        [jToken, jTokenCollateral],
        [liquidator, borrower]
      );
      expect(afterBalances).toEqual(beforeBalances);
    });

    it("fails if repay fails", async () => {
      await send(jToken.joetroller, "setRepayBorrowAllowed", [false]);
      expect(
        await liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).toHaveTrollReject("LIQUIDATE_REPAY_BORROW_FRESH_FAILED");
    });

    it("reverts if seize fails", async () => {
      await send(jToken.joetroller, "setSeizeAllowed", [false]);
      await expect(
        liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).rejects.toRevert("revert token seizure failed");
    });

    xit("reverts if liquidateBorrowVerify fails", async () => {
      await send(jToken.joetroller, "setLiquidateBorrowVerify", [false]);
      await expect(
        liquidateFresh(
          jToken,
          liquidator,
          borrower,
          repayAmount,
          jTokenCollateral
        )
      ).rejects.toRevert(
        "revert liquidateBorrowVerify rejected liquidateBorrow"
      );
    });

    it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
      const beforeBalances = await getBalances(
        [jToken, jTokenCollateral],
        [liquidator, borrower]
      );
      const result = await liquidateFresh(
        jToken,
        liquidator,
        borrower,
        repayAmount,
        jTokenCollateral
      );
      const afterBalances = await getBalances(
        [jToken, jTokenCollateral],
        [liquidator, borrower]
      );
      expect(result).toSucceed();
      expect(result).toHaveLog("LiquidateBorrow", {
        liquidator: liquidator,
        borrower: borrower,
        repayAmount: repayAmount.toString(),
        jTokenCollateral: jTokenCollateral._address,
        seizeTokens: seizeTokens.toString(),
      });
      expect(result).toHaveLog(["Transfer", 0], {
        from: liquidator,
        to: jToken._address,
        amount: repayAmount.toString(),
      });
      expect(result).toHaveLog(["Transfer", 1], {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString(),
      });
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "cash", repayAmount],
          [jToken, "borrows", -repayAmount],
          [jToken, liquidator, "cash", -repayAmount],
          [jTokenCollateral, liquidator, "tokens", seizeTokens],
          [jToken, borrower, "borrows", -repayAmount],
          [jTokenCollateral, borrower, "tokens", -seizeTokens],
        ])
      );
    });
  });

  describe("liquidateBorrow", () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(
        liquidate(jToken, liquidator, borrower, repayAmount, jTokenCollateral)
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      await send(jTokenCollateral.interestRateModel, "setFailBorrowRate", [
        true,
      ]);
      await expect(
        liquidate(jToken, liquidator, borrower, repayAmount, jTokenCollateral)
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
      expect(
        await liquidate(jToken, liquidator, borrower, 0, jTokenCollateral)
      ).toHaveTokenFailure(
        "INVALID_CLOSE_AMOUNT_REQUESTED",
        "LIQUIDATE_CLOSE_AMOUNT_IS_ZERO"
      );
    });

    it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
      const beforeBalances = await getBalances(
        [jToken, jTokenCollateral],
        [liquidator, borrower]
      );
      const result = await liquidate(
        jToken,
        liquidator,
        borrower,
        repayAmount,
        jTokenCollateral
      );
      const gasCost = await avaxGasCost(result);
      const afterBalances = await getBalances(
        [jToken, jTokenCollateral],
        [liquidator, borrower]
      );
      expect(result).toSucceed();
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "cash", repayAmount],
          [jToken, "borrows", -repayAmount],
          [jToken, liquidator, "avax", -gasCost],
          [jToken, liquidator, "cash", -repayAmount],
          [jTokenCollateral, liquidator, "avax", -gasCost],
          [jTokenCollateral, liquidator, "tokens", seizeTokens],
          [jToken, borrower, "borrows", -repayAmount],
          [jTokenCollateral, borrower, "tokens", -seizeTokens],
        ])
      );
    });
  });

  describe("seize", () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      await send(jToken.joetroller, "setSeizeAllowed", [false]);
      expect(
        await seize(jTokenCollateral, liquidator, borrower, seizeTokens)
      ).toHaveTrollReject("LIQUIDATE_SEIZE_JOETROLLER_REJECTION", "MATH_ERROR");
    });

    it("fails if jTokenBalances[borrower] < amount", async () => {
      await setBalance(jTokenCollateral, borrower, 1);
      await expect(
        seize(jTokenCollateral, liquidator, borrower, seizeTokens)
      ).rejects.toRevert("revert subtraction underflow");
    });

    it("fails if jTokenBalances[liquidator] overflows", async () => {
      await setBalance(jTokenCollateral, liquidator, UInt256Max());
      await expect(
        seize(jTokenCollateral, liquidator, borrower, seizeTokens)
      ).rejects.toRevert("revert addition overflow");
    });

    it("succeeds, updates balances, and emits Transfer event", async () => {
      const beforeBalances = await getBalances(
        [jTokenCollateral],
        [liquidator, borrower]
      );
      const result = await seize(
        jTokenCollateral,
        liquidator,
        borrower,
        seizeTokens
      );
      const afterBalances = await getBalances(
        [jTokenCollateral],
        [liquidator, borrower]
      );
      expect(result).toSucceed();
      expect(result).toHaveLog("Transfer", {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString(),
      });
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jTokenCollateral, liquidator, "tokens", seizeTokens],
          [jTokenCollateral, borrower, "tokens", -seizeTokens],
        ])
      );
    });
  });
});
