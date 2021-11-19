const {
  avaxUnsigned,
  avaxMantissa,
  UInt256Max,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  balanceOf,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  preApprove,
  quickMint,
  preSupply,
  quickRedeem,
  quickRedeemUnderlying,
} = require("../Utils/BankerJoe");

const exchangeRate = 50e3;
const mintAmount = avaxUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);
const redeemTokens = avaxUnsigned(10e3);
const redeemAmount = redeemTokens.multipliedBy(exchangeRate);

async function preMint(jToken, minter, mintAmount, mintTokens, exchangeRate) {
  await preApprove(jToken, minter, mintAmount);
  await send(jToken.joetroller, "setMintAllowed", [true]);
  await send(jToken.joetroller, "setMintVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken.underlying, "harnessSetFailTransferFromAddress", [
    minter,
    false,
  ]);
  await send(jToken, "harnessSetBalance", [minter, 0]);
  await send(jToken, "harnessSetExchangeRate", [avaxMantissa(exchangeRate)]);
}

async function mintFresh(jToken, minter, mintAmount) {
  return send(jToken, "harnessMintFresh", [minter, mintAmount]);
}

async function preRedeem(
  jToken,
  redeemer,
  redeemTokens,
  redeemAmount,
  exchangeRate
) {
  await preSupply(jToken, redeemer, redeemTokens);
  await send(jToken.joetroller, "setRedeemAllowed", [true]);
  await send(jToken.joetroller, "setRedeemVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken.underlying, "harnessSetBalance", [
    jToken._address,
    redeemAmount,
  ]);
  await send(jToken.underlying, "harnessSetBalance", [redeemer, 0]);
  await send(jToken.underlying, "harnessSetFailTransferToAddress", [
    redeemer,
    false,
  ]);
  await send(jToken, "harnessSetExchangeRate", [avaxMantissa(exchangeRate)]);
}

async function redeemFreshTokens(jToken, redeemer, redeemTokens, redeemAmount) {
  return send(jToken, "harnessRedeemFresh", [redeemer, redeemTokens, 0]);
}

async function redeemFreshAmount(jToken, redeemer, redeemTokens, redeemAmount) {
  return send(jToken, "harnessRedeemFresh", [redeemer, 0, redeemAmount]);
}

describe("JToken", function () {
  let root, minter, redeemer, accounts;
  let jToken;
  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
    jToken = await makeJToken({
      joetrollerOpts: { kind: "bool" },
      exchangeRate,
    });
  });

  describe("mintFresh", () => {
    beforeEach(async () => {
      await preMint(jToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("fails if joetroller tells it to", async () => {
      await send(jToken.joetroller, "setMintAllowed", [false]);
      expect(await mintFresh(jToken, minter, mintAmount)).toHaveTrollReject(
        "MINT_JOETROLLER_REJECTION",
        "MATH_ERROR"
      );
    });

    it("proceeds if joetroller tells it to", async () => {
      await expect(await mintFresh(jToken, minter, mintAmount)).toSucceed();
    });

    it("fails if not fresh", async () => {
      await fastForward(jToken);
      expect(await mintFresh(jToken, minter, mintAmount)).toHaveTokenFailure(
        "MARKET_NOT_FRESH",
        "MINT_FRESHNESS_CHECK"
      );
    });

    it("continues if fresh", async () => {
      await expect(await send(jToken, "accrueInterest")).toSucceed();
      expect(await mintFresh(jToken, minter, mintAmount)).toSucceed();
    });

    it("fails if insufficient approval", async () => {
      expect(
        await send(jToken.underlying, "approve", [jToken._address, 1], {
          from: minter,
        })
      ).toSucceed();
      await expect(mintFresh(jToken, minter, mintAmount)).rejects.toRevert(
        "revert Insufficient allowance"
      );
    });

    it("fails if insufficient balance", async () => {
      await setBalance(jToken.underlying, minter, 1);
      await expect(mintFresh(jToken, minter, mintAmount)).rejects.toRevert(
        "revert Insufficient balance"
      );
    });

    it("proceeds if sufficient approval and balance", async () => {
      expect(await mintFresh(jToken, minter, mintAmount)).toSucceed();
    });

    it("fails if exchange calculation fails", async () => {
      expect(await send(jToken, "harnessSetExchangeRate", [0])).toSucceed();
      await expect(mintFresh(jToken, minter, mintAmount)).rejects.toRevert(
        "revert divide by zero"
      );
    });

    it("fails if transferring in fails", async () => {
      await send(jToken.underlying, "harnessSetFailTransferFromAddress", [
        minter,
        true,
      ]);
      await expect(mintFresh(jToken, minter, mintAmount)).rejects.toRevert(
        "revert TOKEN_TRANSFER_IN_FAILED"
      );
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([jToken], [minter]);
      const result = await mintFresh(jToken, minter, mintAmount);
      const afterBalances = await getBalances([jToken], [minter]);
      expect(result).toSucceed();
      expect(result).toHaveLog("Mint", {
        minter,
        mintAmount: mintAmount.toString(),
        mintTokens: mintTokens.toString(),
      });
      expect(result).toHaveLog(["Transfer", 1], {
        from: jToken._address,
        to: minter,
        amount: mintTokens.toString(),
      });
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, minter, "cash", -mintAmount],
          [jToken, minter, "tokens", mintTokens],
          [jToken, "cash", mintAmount],
          [jToken, "tokens", mintTokens],
        ])
      );
    });
  });

  describe("mint", () => {
    beforeEach(async () => {
      await preMint(jToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(quickMint(jToken, minter, mintAmount)).rejects.toRevert(
        "revert INTEREST_RATE_MODEL_ERROR"
      );
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await send(jToken.underlying, "harnessSetBalance", [minter, 1]);
      await expect(mintFresh(jToken, minter, mintAmount)).rejects.toRevert(
        "revert Insufficient balance"
      );
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      expect(await quickMint(jToken, minter, mintAmount)).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(await balanceOf(jToken, minter)).toEqualNumber(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(jToken, minter, mintAmount)).toHaveLog(
        "AccrueInterest",
        {
          borrowIndex: "1000000000000000000",
          cashPrior: "0",
          interestAccumulated: "0",
          totalBorrows: "0",
        }
      );
    });
  });

  [redeemFreshTokens, redeemFreshAmount].forEach((redeemFresh) => {
    describe(redeemFresh.name, () => {
      beforeEach(async () => {
        await preRedeem(
          jToken,
          redeemer,
          redeemTokens,
          redeemAmount,
          exchangeRate
        );
      });

      it("fails if joetroller tells it to", async () => {
        await send(jToken.joetroller, "setRedeemAllowed", [false]);
        expect(
          await redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).toHaveTrollReject("REDEEM_JOETROLLER_REJECTION");
      });

      it("fails if not fresh", async () => {
        await fastForward(jToken);
        expect(
          await redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).toHaveTokenFailure("MARKET_NOT_FRESH", "REDEEM_FRESHNESS_CHECK");
      });

      it("continues if fresh", async () => {
        await expect(await send(jToken, "accrueInterest")).toSucceed();
        expect(
          await redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).toSucceed();
      });

      it("fails if insufficient protocol cash to transfer out", async () => {
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          1,
        ]);
        expect(
          await redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).toHaveTokenFailure(
          "TOKEN_INSUFFICIENT_CASH",
          "REDEEM_TRANSFER_OUT_NOT_POSSIBLE"
        );
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          expect(
            await send(jToken, "harnessSetExchangeRate", [UInt256Max()])
          ).toSucceed();
          await expect(
            redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
          ).rejects.toRevert("revert multiplication overflow");
        } else {
          expect(await send(jToken, "harnessSetExchangeRate", [0])).toSucceed();
          await expect(
            redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
          ).rejects.toRevert("revert divide by zero");
        }
      });

      it("fails if transferring out fails", async () => {
        await send(jToken.underlying, "harnessSetFailTransferToAddress", [
          redeemer,
          true,
        ]);
        await expect(
          redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
      });

      it("fails if total supply < redemption amount", async () => {
        await send(jToken, "harnessExchangeRateDetails", [0, 0, 0]);
        await expect(
          redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).rejects.toRevert("revert subtraction underflow");
      });

      it("reverts if new account balance underflows", async () => {
        await send(jToken, "harnessSetBalance", [redeemer, 0]);
        await expect(
          redeemFresh(jToken, redeemer, redeemTokens, redeemAmount)
        ).rejects.toRevert("revert subtraction underflow");
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([jToken], [redeemer]);
        const result = await redeemFresh(
          jToken,
          redeemer,
          redeemTokens,
          redeemAmount
        );
        const afterBalances = await getBalances([jToken], [redeemer]);
        expect(result).toSucceed();
        expect(result).toHaveLog("Redeem", {
          redeemer,
          redeemAmount: redeemAmount.toString(),
          redeemTokens: redeemTokens.toString(),
        });
        expect(result).toHaveLog(["Transfer", 1], {
          from: redeemer,
          to: jToken._address,
          amount: redeemTokens.toString(),
        });
        expect(afterBalances).toEqual(
          await adjustBalances(beforeBalances, [
            [jToken, redeemer, "cash", redeemAmount],
            [jToken, redeemer, "tokens", -redeemTokens],
            [jToken, "cash", -redeemAmount],
            [jToken, "tokens", -redeemTokens],
          ])
        );
      });
    });
  });

  describe("redeem", () => {
    beforeEach(async () => {
      await preRedeem(
        jToken,
        redeemer,
        redeemTokens,
        redeemAmount,
        exchangeRate
      );
    });

    it("emits a redeem failure if interest accrual fails", async () => {
      await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(
        quickRedeem(jToken, redeemer, redeemTokens)
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await setBalance(jToken.underlying, jToken._address, 0);
      expect(
        await quickRedeem(jToken, redeemer, redeemTokens, { exchangeRate })
      ).toHaveTokenFailure(
        "TOKEN_INSUFFICIENT_CASH",
        "REDEEM_TRANSFER_OUT_NOT_POSSIBLE"
      );
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      expect(
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          redeemAmount,
        ])
      ).toSucceed();
      expect(
        await quickRedeem(jToken, redeemer, redeemTokens, { exchangeRate })
      ).toSucceed();
      expect(redeemAmount).not.toEqualNumber(0);
      expect(await balanceOf(jToken.underlying, redeemer)).toEqualNumber(
        redeemAmount
      );
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      expect(
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          redeemAmount,
        ])
      ).toSucceed();
      expect(
        await quickRedeemUnderlying(jToken, redeemer, redeemAmount, {
          exchangeRate,
        })
      ).toSucceed();
      expect(redeemAmount).not.toEqualNumber(0);
      expect(await balanceOf(jToken.underlying, redeemer)).toEqualNumber(
        redeemAmount
      );
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(jToken, minter, mintAmount)).toHaveLog(
        "AccrueInterest",
        {
          borrowIndex: "1000000000000000000",
          cashPrior: "500000000",
          interestAccumulated: "0",
          totalBorrows: "0",
        }
      );
    });
  });
});
