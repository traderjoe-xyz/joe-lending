const {
  makeComptroller,
  makeCToken
} = require('../Utils/Compound');
const {
  etherExp,
  etherDouble,
  etherUnsigned
} = require('../Utils/Ethereum');

async function compAccrued(comptroller, user) {
  return etherUnsigned(await call(comptroller, 'compAccrued', [user]));
}

async function compBalance(comptroller, user) {
  return etherUnsigned(await call(comptroller.comp, 'balanceOf', [user]))
}

describe('Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let comptroller, cLOW, cREP, cZRX, cEVIL;

  beforeEach(async () => {
    let interestRateModelOpts = {borrowRate: 0.000001};
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    cLOW = await makeCToken({comptroller, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
    cREP = await makeCToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
    cZRX = await makeCToken({comptroller, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
    cEVIL = await makeCToken({comptroller, supportMarket: false, underlyingPrice: 3, interestRateModelOpts});
  });

  it('should be able to claim rewards for supplier', async () => {
    const mkt = cREP;
    await send(comptroller.comp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

    await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
    await send(comptroller, "setCompSupplyState", [mkt._address, etherDouble(6), 10]);
    await send(comptroller, "setCompSupplierIndex", [mkt._address, a1, etherDouble(2)])
    /*
      supplierAmount  = 5e18
      deltaIndex      = marketStoredIndex - userStoredIndex
                      = 6e36 - 2e36 = 4e36
      suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                      = 5e18 * 4e36 / 1e36 = 20e18
    */

    await send(comptroller, "claimComp", [a1]);
    expect(await compAccrued(comptroller, a1)).toEqualNumber(0);
    expect(await compBalance(comptroller, a1)).toEqualNumber(20e18);
  });

  it('should be able to claim rewards for borrower', async () => {
    const mkt = cREP;
    await send(comptroller.comp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

    await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5e18), etherExp(1)]);
    await send(comptroller, "setCompBorrowState", [mkt._address, etherDouble(6), 10]);
    await send(comptroller, "setCompBorrowerIndex", [mkt._address, a1, etherDouble(1)]);

    /*
      100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 compBorrowIndex
      this tests that an acct with half the total borrows over that time gets 25e18 COMP
      borrowerAmount = borrowBalance * 1e18 / borrow idx
                     = 5e18 * 1e18 / 1e18 = 5e18
      deltaIndex     = marketStoredIndex - userStoredIndex
                     = 6e36 - 1e36 = 5e36
      borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                     = 5e18 * 5e36 / 1e36 = 25e18
    */
    await send(comptroller, "claimComp", [a1]);
    expect(await compAccrued(comptroller, a1)).toEqualNumber(0);
    expect(await compBalance(comptroller, a1)).toEqualNumber(25e18);
  });
});
