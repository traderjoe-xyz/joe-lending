const {
  etherUnsigned,
  etherMantissa,
  mergeInterface
} = require('../Utils/Ethereum');

const {
  makeCToken,
  makeFlashloanReceiver,
  balanceOf,
} = require('../Utils/Compound');

describe('Flashloan test', function () {
  let cToken;
  let flashloanReceiver;
  let cash = 1000_000;
  let cashOnChain = 1000_000;
  let receiverBalance = 100;
  let reservesFactor = 0.5;

  beforeEach(async () => {
    cToken = await makeCToken({kind: 'ccollateralcap', supportMarket: true});
    flashloanReceiver = await makeFlashloanReceiver()

    // so that we can format cToken event logs
    mergeInterface(flashloanReceiver, cToken)

    await send(cToken.underlying, 'harnessSetBalance', [cToken._address, cashOnChain]);
    await send(cToken, 'harnessSetInternalCash', [cash]);
    await send(cToken, 'harnessSetBlockNumber', [etherUnsigned(1e6)]);
    await send(cToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(1e6)]);
    await send(cToken, 'harnessSetReserveFactorFresh', [etherMantissa(reservesFactor)]);

    await send(cToken.underlying, 'harnessSetBalance', [flashloanReceiver._address, receiverBalance]);
  });

  describe('internal cash equal underlying balance', () => {

    it("repay correctly", async () => {
      const borrowAmount = 10_000;
      const totalFee = 3
      const reservesFee = 1
      const result = await send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])

      expect(result).toHaveLog('Flashloan', {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      })

      expect(await balanceOf(cToken.underlying, cToken._address)).toEqualNumber(cashOnChain + totalFee)
      expect(await call(cToken, 'getCash', [])).toEqualNumber(cash + totalFee)
      expect(await call(cToken, 'totalReserves', [])).toEqualNumber(reservesFee)
      expect(await balanceOf(cToken.underlying, flashloanReceiver._address)).toEqualNumber(receiverBalance - totalFee)
    });

    it("repay correctly, total fee is truncated", async () => {
      const borrowAmount = 1000;
      const totalFee = 0;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])

      expect(result).toHaveLog('Flashloan', {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      })

      expect(await balanceOf(cToken.underlying, cToken._address)).toEqualNumber(cashOnChain + totalFee)
      expect(await call(cToken, 'getCash', [])).toEqualNumber(cash + totalFee)
      expect(await call(cToken, 'totalReserves', [])).toEqualNumber(reservesFee)
      expect(await balanceOf(cToken.underlying, flashloanReceiver._address)).toEqualNumber(receiverBalance - totalFee)
    });

    it("repay correctly, reserve fee is truncated", async () => {
      const borrowAmount = 3334;
      const totalFee = 1;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])

      expect(result).toHaveLog('Flashloan', {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      })

      expect(await balanceOf(cToken.underlying, cToken._address)).toEqualNumber(cashOnChain + totalFee)
      expect(await call(cToken, 'getCash', [])).toEqualNumber(cash + totalFee)
      expect(await call(cToken, 'totalReserves', [])).toEqualNumber(reservesFee)
      expect(await balanceOf(cToken.underlying, flashloanReceiver._address)).toEqualNumber(receiverBalance - totalFee)
    });


    it("borrow exceed cash", async () => {
      const borrowAmount = cash + 1;
      const totalFee = 3
      const result = send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])
      await expect(result).rejects.toRevert('revert INSUFFICIENT_LIQUIDITY')
    })

    it('repay not enough', async () => {
      const borrowAmount = 100000;
      const result = send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount])
      await expect(result).rejects.toRevert('revert BALANCE_INCONSISTENT')
    })

    it('repay too much', async () => {
      const borrowAmount = 100;
      const result = send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + 100])
      await expect(result).rejects.toRevert('revert BALANCE_INCONSISTENT')
    })

  });

  describe('internal cash less than underlying balance', () => {

    beforeEach(async () => {
      // increase underlying balance without setting internal cash
      cashOnChain = cash + 100
      await send(cToken.underlying, 'harnessSetBalance', [cToken._address, cashOnChain])
    })

    afterEach(async () => {
      cashOnChain = cash
    })

    it("repay correctly", async () => {
      const borrowAmount = 10_000;
      const totalFee = 3
      const reservesFee = 1
      const result = await send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])

      expect(result).toHaveLog('Flashloan', {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      })

      expect(await balanceOf(cToken.underlying, cToken._address)).toEqualNumber(cashOnChain + totalFee)
      expect(await call(cToken, 'getCash', [])).toEqualNumber(cash + totalFee)
      expect(await call(cToken, 'totalReserves', [])).toEqualNumber(reservesFee)
      expect(await balanceOf(cToken.underlying, flashloanReceiver._address)).toEqualNumber(receiverBalance - totalFee)
    });

    it("repay correctly, total fee is truncated", async () => {
      const borrowAmount = 1000;
      const totalFee = 0;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])

      expect(result).toHaveLog('Flashloan', {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      })

      expect(await balanceOf(cToken.underlying, cToken._address)).toEqualNumber(cashOnChain + totalFee)
      expect(await call(cToken, 'getCash', [])).toEqualNumber(cash + totalFee)
      expect(await call(cToken, 'totalReserves', [])).toEqualNumber(reservesFee)
      expect(await balanceOf(cToken.underlying, flashloanReceiver._address)).toEqualNumber(receiverBalance - totalFee)
    });

    it("repay correctly, reserve fee is truncated", async () => {
      const borrowAmount = 3334;
      const totalFee = 1;
      const reservesFee = 0;
      const result = await send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])

      expect(result).toHaveLog('Flashloan', {
        receiver: flashloanReceiver._address,
        amount: borrowAmount,
        totalFee: totalFee,
        reservesFee: reservesFee,
      })

      expect(await balanceOf(cToken.underlying, cToken._address)).toEqualNumber(cashOnChain + totalFee)
      expect(await call(cToken, 'getCash', [])).toEqualNumber(cash + totalFee)
      expect(await call(cToken, 'totalReserves', [])).toEqualNumber(reservesFee)
      expect(await balanceOf(cToken.underlying, flashloanReceiver._address)).toEqualNumber(receiverBalance - totalFee)
    });


    it("borrow exceed cash", async () => {
      const borrowAmount = cash + 1;
      const totalFee = 3
      const result = send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + totalFee])
      await expect(result).rejects.toRevert('revert INSUFFICIENT_LIQUIDITY')
    })

    it('repay not enough', async () => {
      const borrowAmount = 100000;
      const result = send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount])
      await expect(result).rejects.toRevert('revert BALANCE_INCONSISTENT')
    })

    it('repay too much', async () => {
      const borrowAmount = 100;
      const result = send(flashloanReceiver, 'doFlashloan', [cToken._address, borrowAmount, borrowAmount + 100])
      await expect(result).rejects.toRevert('revert BALANCE_INCONSISTENT')
    })

  })
});

describe('Flashloan re-entry test', () => {
  let cToken;
  let cash = 1000_000;

  beforeEach(async () => {
    cToken = await makeCToken({kind: 'ccollateralcap', supportMarket: true});
    await send(cToken.underlying, 'harnessSetBalance', [cToken._address, cash]);
    await send(cToken, 'harnessSetInternalCash', [cash]);
    await send(cToken, 'harnessSetBlockNumber', [etherUnsigned(1e6)]);
    await send(cToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(1e6)]);
  });

  it('flashloan and mint', async () => {
    const flashloanAndMint = await makeFlashloanReceiver({ kind: 'flashloan-and-mint'})
    const borrowAmount = 100;
    const result = send(flashloanAndMint, 'doFlashloan', [cToken._address, borrowAmount])
    await expect(result).rejects.toRevert('revert re-entered')
  })

  it('flashloan and repay borrow', async () => {
    const flashloanAndRepayBorrow = await makeFlashloanReceiver({ kind: 'flashloan-and-repay-borrow'})
    const borrowAmount = 100;
    const result = send(flashloanAndRepayBorrow, 'doFlashloan', [cToken._address, borrowAmount])
    await expect(result).rejects.toRevert('revert re-entered')
  })


  it('flashloan twice', async () => {
    const flashloanTwice = await makeFlashloanReceiver({ kind: 'flashloan-twice' })
    const borrowAmount = 100;
    const result = send(flashloanTwice, 'doFlashloan', [cToken._address, borrowAmount])
    await expect(result).rejects.toRevert('revert re-entered')
  })

})
