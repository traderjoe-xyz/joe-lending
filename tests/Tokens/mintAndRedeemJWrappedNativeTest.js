const {
  avaxGasCost,
  avaxMantissa,
  avaxUnsigned,
} = require("../Utils/Avalanche");

const {
  makeJToken,
  fastForward,
  setBalance,
  setAvaxBalance,
  getBalances,
  adjustBalances,
} = require("../Utils/BankerJoe");

const exchangeRate = 5;
const mintAmount = avaxUnsigned(1e5);
const mintTokens = mintAmount.dividedBy(exchangeRate);
const redeemTokens = avaxUnsigned(10e3);
const redeemAmount = redeemTokens.multipliedBy(exchangeRate);

async function preMint(jToken, minter, mintAmount, mintTokens, exchangeRate) {
  await send(jToken.joetroller, "setMintAllowed", [true]);
  await send(jToken.joetroller, "setMintVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken.underlying, "deposit", [], {
    from: minter,
    value: mintAmount,
  });
  await send(jToken.underlying, "approve", [jToken._address, mintAmount], {
    from: minter,
  });
  await send(jToken, "harnessSetBalance", [minter, 0]);
  await send(jToken, "harnessSetExchangeRate", [avaxMantissa(exchangeRate)]);
}

async function mintNative(jToken, minter, mintAmount) {
  return send(jToken, "mintNative", [], { from: minter, value: mintAmount });
}

async function mint(jToken, minter, mintAmount) {
  return send(jToken, "mint", [mintAmount], { from: minter });
}

async function preRedeem(
  jToken,
  redeemer,
  redeemTokens,
  redeemAmount,
  exchangeRate
) {
  const root = saddle.account;
  await send(jToken.joetroller, "setRedeemAllowed", [true]);
  await send(jToken.joetroller, "setRedeemVerify", [true]);
  await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(jToken, "harnessSetExchangeRate", [avaxMantissa(exchangeRate)]);
  await send(jToken.underlying, "deposit", [], {
    from: root,
    value: redeemAmount,
  });
  await send(jToken.underlying, "harnessSetBalance", [
    jToken._address,
    redeemAmount,
  ]);
  await send(jToken, "harnessSetTotalSupply", [redeemTokens]);
  await setBalance(jToken, redeemer, redeemTokens);
}

async function redeemJTokensNative(
  jToken,
  redeemer,
  redeemTokens,
  redeemAmount
) {
  return send(jToken, "redeemNative", [redeemTokens], { from: redeemer });
}

async function redeemJTokens(jToken, redeemer, redeemTokens, redeemAmount) {
  return send(jToken, "redeem", [redeemTokens], { from: redeemer });
}

async function redeemUnderlyingNative(
  jToken,
  redeemer,
  redeemTokens,
  redeemAmount
) {
  return send(jToken, "redeemUnderlyingNative", [redeemAmount], {
    from: redeemer,
  });
}

async function redeemUnderlying(jToken, redeemer, redeemTokens, redeemAmount) {
  return send(jToken, "redeemUnderlying", [redeemAmount], { from: redeemer });
}

describe("CWrappedNative", () => {
  let root, minter, redeemer, accounts;
  let jToken;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
    jToken = await makeJToken({
      kind: "jwrapped",
      joetrollerOpts: { kind: "bool" },
      exchangeRate,
    });
    await fastForward(jToken, 1);
  });

  [mintNative, mint].forEach((mint) => {
    describe(mint.name, () => {
      beforeEach(async () => {
        await preMint(jToken, minter, mintAmount, mintTokens, exchangeRate);
      });

      it("reverts if interest accrual fails", async () => {
        await send(jToken.interestRateModel, "setFailBorrowRate", [true]);
        await expect(mint(jToken, minter, mintAmount)).rejects.toRevert(
          "revert INTEREST_RATE_MODEL_ERROR"
        );
      });
    });
  });

  describe("mint", () => {
    beforeEach(async () => {
      await preMint(jToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("mint", async () => {
      const beforeBalances = await getBalances([jToken], [minter]);
      const receipt = await mint(jToken, minter, mintAmount);
      const afterBalances = await getBalances([jToken], [minter]);
      expect(receipt).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "tokens", mintTokens],
          [jToken, "cash", mintAmount],
          [jToken, minter, "cash", -mintAmount],
          [jToken, minter, "avax", -(await avaxGasCost(receipt))],
          [jToken, minter, "tokens", mintTokens],
        ])
      );
    });

    it("mintNative", async () => {
      const beforeBalances = await getBalances([jToken], [minter]);
      const receipt = await mintNative(jToken, minter, mintAmount);
      const afterBalances = await getBalances([jToken], [minter]);
      expect(receipt).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [jToken, "tokens", mintTokens],
          [jToken, "cash", mintAmount],
          [
            jToken,
            minter,
            "avax",
            -mintAmount.plus(await avaxGasCost(receipt)),
          ],
          [jToken, minter, "tokens", mintTokens],
        ])
      );
    });
  });

  [redeemJTokensNative, redeemUnderlyingNative].forEach((redeem) => {
    describe(redeem.name, () => {
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
          redeem(jToken, redeemer, redeemTokens, redeemAmount)
        ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns error from redeemFresh without emitting any extra logs", async () => {
        await expect(
          redeem(
            jToken,
            redeemer,
            redeemTokens.multipliedBy(5),
            redeemAmount.multipliedBy(5)
          )
        ).rejects.toRevert("revert subtraction underflow");
      });

      it("returns success from redeemFresh and redeems the correct amount", async () => {
        await fastForward(jToken);
        const beforeBalances = await getBalances([jToken], [redeemer]);
        const receipt = await redeem(
          jToken,
          redeemer,
          redeemTokens,
          redeemAmount
        );
        expect(receipt).toTokenSucceed();
        const afterBalances = await getBalances([jToken], [redeemer]);
        expect(redeemTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(
          await adjustBalances(beforeBalances, [
            [jToken, "tokens", -redeemTokens],
            [jToken, "cash", -redeemAmount],
            [
              jToken,
              redeemer,
              "avax",
              redeemAmount.minus(await avaxGasCost(receipt)),
            ],
            [jToken, redeemer, "tokens", -redeemTokens],
          ])
        );
      });
    });
  });

  [redeemJTokens, redeemUnderlying].forEach((redeem) => {
    describe(redeem.name, () => {
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
          redeem(jToken, redeemer, redeemTokens, redeemAmount)
        ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns error from redeemFresh without emitting any extra logs", async () => {
        await expect(
          redeem(
            jToken,
            redeemer,
            redeemTokens.multipliedBy(5),
            redeemAmount.multipliedBy(5)
          )
        ).rejects.toRevert("revert subtraction underflow");
      });

      it("returns success from redeemFresh and redeems the correct amount", async () => {
        await fastForward(jToken);
        const beforeBalances = await getBalances([jToken], [redeemer]);
        const receipt = await redeem(
          jToken,
          redeemer,
          redeemTokens,
          redeemAmount
        );
        expect(receipt).toTokenSucceed();
        const afterBalances = await getBalances([jToken], [redeemer]);
        expect(redeemTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(
          await adjustBalances(beforeBalances, [
            [jToken, "tokens", -redeemTokens],
            [jToken, "cash", -redeemAmount],
            [jToken, redeemer, "cash", redeemAmount],
            [jToken, redeemer, "avax", -(await avaxGasCost(receipt))],
            [jToken, redeemer, "tokens", -redeemTokens],
          ])
        );
      });
    });
  });
});
