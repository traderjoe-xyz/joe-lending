const {
  etherUnsigned,
  etherMantissa,
  UInt256Max
} = require('../Utils/Ethereum');

const {
  makeCToken,
  balanceOf,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  preApprove,
  quickMint
} = require('../Utils/Compound');

const exchangeRate = 50e3;
const mintAmount = etherUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);

async function preMint(cToken, minter, mintAmount, mintTokens, exchangeRate) {
  await preApprove(cToken, minter, mintAmount);
  await send(cToken.comptroller, 'setMintAllowed', [true]);
  await send(cToken.comptroller, 'setMintVerify', [true]);
  await send(cToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(cToken.underlying, 'harnessSetFailTransferFromAddress', [minter, false]);
  await send(cToken, 'harnessSetBalance', [minter, 0]);
  await send(cToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

async function mintFresh(cToken, minter, mintAmount) {
  return send(cToken, 'harnessMintFresh', [minter, mintAmount]);
}

async function redeemFreshTokens(cToken, redeemer, redeemTokens, redeemAmount) {
  return send(cToken, 'harnessRedeemFresh', [redeemer, redeemTokens, 0]);
}

async function redeemFreshAmount(cToken, redeemer, redeemTokens, redeemAmount) {
  return send(cToken, 'harnessRedeemFresh', [redeemer, 0, redeemAmount]);
}

describe('CToken', function () {
  let root, minter, accounts;
  let cToken;
  beforeEach(async () => {
    [root, minter, ...accounts] = saddle.accounts;
    cToken = await makeCToken({kind: 'cctoken', comptrollerOpts: {kind: 'bool'}, exchangeRate});
  });

  describe('mintFresh', () => {
    beforeEach(async () => {
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("fails if comptroller tells it to", async () => {
      await send(cToken.comptroller, 'setMintAllowed', [false]);
      expect(await mintFresh(cToken, minter, mintAmount)).toHaveTrollReject('MINT_COMPTROLLER_REJECTION', 'MATH_ERROR');
    });

    it("proceeds if comptroller tells it to", async () => {
      await expect(await mintFresh(cToken, minter, mintAmount)).toSucceed();
    });

    it("fails if not fresh", async () => {
      await fastForward(cToken);
      expect(await mintFresh(cToken, minter, mintAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'MINT_FRESHNESS_CHECK');
    });

    it("continues if fresh", async () => {
      expect(await send(cToken, 'accrueInterest')).toSucceed();
      expect(await mintFresh(cToken, minter, mintAmount)).toSucceed();
    });

    it("fails if insufficient approval", async () => {
      expect(
        await send(cToken.underlying, 'approve', [cToken._address, 1], {from: minter})
      ).toSucceed();
      await expect(mintFresh(cToken, minter, mintAmount)).rejects.toRevert('revert Insufficient allowance');
    });

    it("fails if insufficient balance", async() => {
      await setBalance(cToken.underlying, minter, 1);
      await expect(mintFresh(cToken, minter, mintAmount)).rejects.toRevert('revert Insufficient balance');
    });

    it("proceeds if sufficient approval and balance", async () =>{
      expect(await mintFresh(cToken, minter, mintAmount)).toSucceed();
    });

    it("fails if exchange calculation fails", async () => {
      expect(await send(cToken, 'harnessSetExchangeRate', [0])).toSucceed();
      await expect(mintFresh(cToken, minter, mintAmount)).rejects.toRevert('revert divide by zero');
    });

    it("fails if transferring in fails", async () => {
      await send(cToken.underlying, 'harnessSetFailTransferFromAddress', [minter, true]);
      await expect(mintFresh(cToken, minter, mintAmount)).rejects.toRevert('revert TOKEN_TRANSFER_IN_FAILED');
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([cToken], [minter]);
      const result = await mintFresh(cToken, minter, mintAmount);
      const afterBalances = await getBalances([cToken], [minter]);
      expect(result).toSucceed();
      expect(result).toHaveLog('Mint', {
        minter,
        mintAmount: mintAmount.toString(),
        mintTokens: mintTokens.toString()
      });
      expect(result).toHaveLog(['Transfer', 1], {
        from: cToken._address,
        to: minter,
        amount: mintTokens.toString()
      });
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [cToken, minter, 'cash', -mintAmount],
        [cToken, minter, 'tokens', mintTokens],
        [cToken, 'cash', mintAmount],
        [cToken, 'tokens', mintTokens]
      ]));
    });
  });

  describe('mint', () => {
    beforeEach(async () => {
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      await send(cToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await send(cToken.underlying, 'harnessSetBalance', [minter, 1]);
      await expect(mintFresh(cToken, minter, mintAmount)).rejects.toRevert('revert Insufficient balance');
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(cToken, minter, mintAmount)).toHaveLog('AccrueInterest', {
        borrowIndex: "1000000000000000000",
        cashPrior: "0",
        interestAccumulated: "0",
        totalBorrows: "0",
      });
    });
  });

  [redeemFreshTokens, redeemFreshAmount].forEach((redeemFresh) => {
    describe(redeemFresh.name, () => {
      beforeEach(async () => {
        await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
        expect(await mintFresh(cToken, minter, mintAmount)).toSucceed();
      });

      it("fails if comptroller tells it to", async () =>{
        await send(cToken.comptroller, 'setRedeemAllowed', [false]);
        expect(await redeemFresh(cToken, minter, mintTokens, mintAmount)).toHaveTrollReject('REDEEM_COMPTROLLER_REJECTION');
      });

      it("fails if not fresh", async () => {
        await fastForward(cToken);
        expect(await redeemFresh(cToken, minter, mintTokens, mintAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'REDEEM_FRESHNESS_CHECK');
      });

      it("continues if fresh", async () => {
        expect(await send(cToken, 'accrueInterest')).toSucceed();
        expect(await redeemFresh(cToken, minter, mintTokens, mintAmount)).toSucceed();
      });

      it("fails if insufficient protocol cash to transfer out", async() => {
        await send(cToken, 'harnessSetInternalCash', [1]);
        expect(await redeemFresh(cToken, minter, mintTokens, mintAmount)).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDEEM_TRANSFER_OUT_NOT_POSSIBLE');
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          expect(await send(cToken, 'harnessSetExchangeRate', [UInt256Max()])).toSucceed();
          await expect(redeemFresh(cToken, minter, mintTokens, mintAmount)).rejects.toRevert("revert multiplication overflow");
        } else {
          expect(await send(cToken, 'harnessSetExchangeRate', [0])).toSucceed();
          await expect(redeemFresh(cToken, minter, mintTokens, mintAmount)).rejects.toRevert("revert divide by zero");
        }
      });

      it("fails if transferring out fails", async () => {
        await send(cToken.underlying, 'harnessSetFailTransferToAddress', [minter, true]);
        await expect(redeemFresh(cToken, minter, mintTokens, mintAmount)).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
      });

      it("fails if total supply < redemption amount", async () => {
        await send(cToken, 'harnessExchangeRateDetails', [0, 0, 0]);
        await expect(redeemFresh(cToken, minter, mintTokens, mintAmount)).rejects.toRevert("revert subtraction underflow");
      });

      it("reverts if new account balance underflows", async () => {
        await send(cToken, 'harnessSetBalance', [minter, 0]);
        await expect(redeemFresh(cToken, minter, mintTokens, mintAmount)).rejects.toRevert("revert subtraction underflow");
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([cToken], [minter]);
        const result = await redeemFresh(cToken, minter, mintTokens, mintAmount);
        const afterBalances = await getBalances([cToken], [minter]);
        expect(result).toSucceed();
        expect(result).toHaveLog('Redeem', {
          redeemer: minter,
          redeemAmount: mintAmount.toString(),
          redeemTokens: mintTokens.toString()
        });
        expect(result).toHaveLog(['Transfer', 1], {
          from: minter,
          to: cToken._address,
          amount: mintTokens.toString()
        });
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [cToken, minter, 'cash', mintAmount],
          [cToken, minter, 'tokens', -mintTokens],
          [cToken, 'cash', -mintAmount],
          [cToken, 'tokens', -mintTokens]
        ]));
      });
    });
  });

  describe('redeem', () => {
    beforeEach(async () => {
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
      expect(await mintFresh(cToken, minter, mintAmount)).toSucceed();
    });

    it("emits a redeem failure if interest accrual fails", async () => {
      await send(cToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(cToken, 1);
      await expect(send(cToken, 'redeem', [mintTokens], { from: minter })).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await send(cToken, 'harnessSetInternalCash', [0]);
      expect(await send(cToken, 'redeem', [mintTokens], { from: minter })).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDEEM_TRANSFER_OUT_NOT_POSSIBLE');
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      expect(await send(cToken, 'redeem', [mintTokens], { from: minter })).toSucceed();
      expect(await balanceOf(cToken.underlying, minter)).toEqualNumber(mintAmount);
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      expect(await send(cToken, 'redeemUnderlying', [mintAmount], { from: minter })).toSucceed();
      expect(await balanceOf(cToken.underlying, minter)).toEqualNumber(mintAmount);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(cToken, minter, mintAmount)).toHaveLog('AccrueInterest', {
        borrowIndex: "1000000000000000000",
        cashPrior: "100000",
        interestAccumulated: "0",
        totalBorrows: "0",
      });
    });
  });
});
