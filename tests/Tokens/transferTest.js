const {
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');

const {
  makeCToken,
  preApprove,
  balanceOf,
  fastForward
} = require('../Utils/Compound');

const exchangeRate = 50e3;
const mintAmount = etherUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);

async function preMint(cToken, minter, mintAmount, exchangeRate) {
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

describe('CToken', function () {
  let root, minter, accounts;
  beforeEach(async () => {
    [root, minter, ...accounts] = saddle.accounts;
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      const cToken = await makeCToken({supportMarket: true});
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(0);
      await expect(send(cToken, 'transfer', [accounts[0], 100])).rejects.toRevert('revert subtraction underflow');
    });

    it("transfers 50 tokens", async () => {
      const cToken = await makeCToken({supportMarket: true});
      await send(cToken, 'harnessSetBalance', [root, 100]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(100);
      await send(cToken, 'transfer', [accounts[0], 50]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(50);
      expect(await call(cToken, 'balanceOf', [accounts[0]])).toEqualNumber(50);
    });

    it("doesn't transfer when src == dst", async () => {
      const cToken = await makeCToken({supportMarket: true});
      await send(cToken, 'harnessSetBalance', [root, 100]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(100);
      expect(await send(cToken, 'transfer', [root, 50])).toHaveTokenFailure('BAD_INPUT', 'TRANSFER_NOT_ALLOWED');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      const cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}});
      await send(cToken, 'harnessSetBalance', [root, 100]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(100);

      await send(cToken.comptroller, 'setTransferAllowed', [false])
      expect(await send(cToken, 'transfer', [root, 50])).toHaveTrollReject('TRANSFER_COMPTROLLER_REJECTION');

      await send(cToken.comptroller, 'setTransferAllowed', [true])
      await send(cToken.comptroller, 'setTransferVerify', [false])
      await expect(send(cToken, 'transfer', [accounts[0], 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });

    it("transfers cslp token", async () => {
      const cToken = await makeCToken({kind: 'cslp', comptrollerOpts: {kind: 'bool'}});
      const sushiAddress = await call(cToken, 'sushi', []);
      const masterChefAddress = await call(cToken, 'masterChef', []);

      const sushi = await saddle.getContractAt('SushiToken', sushiAddress);
      const masterChef = await saddle.getContractAt('MasterChef', masterChefAddress);

      await preMint(cToken, minter, mintAmount, exchangeRate);
      expect(await mintFresh(cToken, minter, mintAmount)).toSucceed();
      expect(await call(cToken, 'balanceOf', [minter])).toEqualNumber(mintTokens);

      await fastForward(cToken, 1);
      await fastForward(masterChef, 1);

      await send(cToken, 'transfer', [accounts[0], mintTokens], { from: minter });
      expect(await call(cToken, 'balanceOf', [minter])).toEqualNumber(0);
      expect(await call(cToken, 'balanceOf', [accounts[0]])).toEqualNumber(mintTokens);

      expect(await balanceOf(sushi, minter)).toEqualNumber(etherMantissa(0));
      expect(await call(cToken, 'xSushiUserAccrued', [minter])).toEqualNumber(etherMantissa(1));

      await fastForward(cToken, 1);
      await fastForward(masterChef, 1);

      await send(cToken, 'claimSushi', [minter], { from: minter });
      expect(await balanceOf(sushi, minter)).toEqualNumber(etherMantissa(1));
      expect(await call(cToken, 'xSushiUserAccrued', [minter])).toEqualNumber(etherMantissa(0));
    });
  });
});
