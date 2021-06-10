"use strict";

const { dfn } = require('./JS');
const {
  encodeParameters,
  etherBalance,
  etherMantissa,
  etherUnsigned,
  mergeInterface
} = require('./Ethereum');

async function makeComptroller(opts = {}) {
  const {
    root = saddle.account,
    kind = 'unitroller'
  } = opts || {};

  if (kind == 'bool') {
    return await deploy('BoolComptroller');
  }

  if (kind == 'false-marker') {
    return await deploy('FalseMarkerMethodComptroller');
  }

  if (kind == 'v1-no-proxy') {
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));

    await send(comptroller, '_setCloseFactor', [closeFactor]);
    await send(comptroller, '_setPriceOracle', [priceOracle._address]);

    return Object.assign(comptroller, { priceOracle });
  }

  if (kind == 'compound') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('CompoundComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = etherMantissa(1);
    const comp = opts.comp || await deploy('Comp', [opts.compOwner || root]);

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, 'setCompAddress', [comp._address]); // harness only

    return Object.assign(unitroller, { priceOracle, comp });
  }

  if (kind == 'unitroller') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = etherMantissa(1);

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);

    return Object.assign(unitroller, { priceOracle });
  }
}

async function makeCToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'cerc20'
  } = opts || {};

  const comptroller = opts.comptroller || await makeComptroller(opts.comptrollerOpts);
  const interestRateModel = opts.interestRateModel || await makeInterestRateModel(opts.interestRateModelOpts);
  const exchangeRate = etherMantissa(dfn(opts.exchangeRate, 1));
  const decimals = etherUnsigned(dfn(opts.decimals, 8));
  const symbol = opts.symbol || (kind === 'cether' ? 'crETH' : 'cOMG');
  const name = opts.name || `CToken ${symbol}`;
  const admin = opts.admin || root;

  let cToken, underlying;
  let cDelegator, cDelegatee;
  let version = 0;

  switch (kind) {
    case 'cether':
      cToken = await deploy('CEtherHarness',
        [
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin
        ])
      break;

    case 'ccapable':
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      cDelegatee = await deploy('CCapableErc20Delegate');
      cDelegator = await deploy('CErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          cDelegatee._address,
          "0x0"
        ]
      );
      cToken = await saddle.getContractAt('CCapableErc20Delegate', cDelegator._address);
      break;

    case 'ccollateralcap':
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      cDelegatee = await deploy('CCollateralCapErc20DelegateHarness');
      cDelegator = await deploy('CCollateralCapErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          cDelegatee._address,
          "0x0"
        ]
      );
      cToken = await saddle.getContractAt('CCollateralCapErc20DelegateHarness', cDelegator._address);
      version = 1; // ccollateralcap's version is 1
      break;

    case 'cslp':
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      const sushiToken = await deploy('SushiToken');
      const masterChef = await deploy('MasterChef', [sushiToken._address]);
      await send(masterChef, 'add', [1, underlying._address]);
      const sushiBar = await deploy('SushiBar', [sushiToken._address]);

      cDelegatee = await deploy('CSLPDelegateHarness');
      cDelegator = await deploy('CErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          cDelegatee._address,
          encodeParameters(['address', 'address', 'uint'], [masterChef._address, sushiBar._address, 0]) // pid = 0
        ]
      );
      cToken = await saddle.getContractAt('CSLPDelegateHarness', cDelegator._address); // XXXS at
      break;

    case 'cctoken':
      underlying = opts.underlying || await makeToken({kind: "ctoken"});
      cDelegatee = await deploy('CCTokenDelegateHarness');
      cDelegator = await deploy('CErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          cDelegatee._address,
          "0x0"
        ]
      );
      cToken = await saddle.getContractAt('CCTokenDelegateHarness', cDelegator._address); // XXXS at
      break;

    case 'cerc20':
    default:
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      cDelegatee = await deploy('CErc20DelegateHarness');
      cDelegator = await deploy('CErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          cDelegatee._address,
          "0x0"
        ]
      );
      cToken = await saddle.getContractAt('CErc20DelegateHarness', cDelegator._address); // XXXS at
      break;
  }

  if (opts.supportMarket) {
    await send(comptroller, '_supportMarket', [cToken._address, version]);
  }

  if (opts.underlyingPrice) {
    const price = etherMantissa(opts.underlyingPrice);
    await send(comptroller.priceOracle, 'setUnderlyingPrice', [cToken._address, price]);
  }

  if (opts.collateralFactor) {
    const factor = etherMantissa(opts.collateralFactor);
    expect(await send(comptroller, '_setCollateralFactor', [cToken._address, factor])).toSucceed();
  }

  return Object.assign(cToken, { name, symbol, underlying, comptroller, interestRateModel });
}

async function makeInterestRateModel(opts = {}) {
  const {
    root = saddle.account,
    kind = 'harnessed'
  } = opts || {};

  if (kind == 'harnessed') {
    const borrowRate = etherMantissa(dfn(opts.borrowRate, 0));
    return await deploy('InterestRateModelHarness', [borrowRate]);
  }

  if (kind == 'false-marker') {
    const borrowRate = etherMantissa(dfn(opts.borrowRate, 0));
    return await deploy('FalseMarkerMethodInterestRateModel', [borrowRate]);
  }

  if (kind == 'jump-rate') {
    const baseRate = etherMantissa(dfn(opts.baseRate, 0));
    const multiplier = etherMantissa(dfn(opts.multiplier, 1e-18));
    const jump = etherMantissa(dfn(opts.jump, 0));
    const kink = etherMantissa(dfn(opts.kink, 1));
    const roof = etherMantissa(dfn(opts.roof, 1));
    return await deploy('JumpRateModelV2', [baseRate, multiplier, jump, kink, roof, root]);
  }

  if (kind == 'triple-slope') {
    const baseRate = etherMantissa(dfn(opts.baseRate, 0));
    const multiplier = etherMantissa(dfn(opts.multiplier, 0.1));
    const jump = etherMantissa(dfn(opts.jump, 0));
    const kink1 = etherMantissa(dfn(opts.kink1, 1));
    const kink2 = etherMantissa(dfn(opts.kink2, 1));
    const roof = etherMantissa(dfn(opts.roof, 1));
    return await deploy('TripleSlopeRateModel', [baseRate, multiplier, jump, kink1, kink2, roof, root]);
  }
}

async function makePriceOracle(opts = {}) {
  const {
    root = saddle.account,
    kind = 'simple'
  } = opts || {};

  if (kind == 'simple') {
    return await deploy('SimplePriceOracle');
  }
}

async function makeToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'erc20'
  } = opts || {};

  if (kind == 'erc20') {
    const quantity = etherUnsigned(dfn(opts.quantity, 1e25));
    const decimals = etherUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'OMG';
    const name = opts.name || `Erc20 ${symbol}`;
    return await deploy('ERC20Harness', [quantity, name, decimals, symbol]);
  } else if (kind == 'ctoken') {
    const quantity = etherUnsigned(dfn(opts.quantity, 1e25));
    const decimals = etherUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'cOMG';
    const name = opts.name || `Compound ${symbol}`;

    const comptroller = await makeComptroller({kind: "compound"});
    const cToken = await deploy('CTokenHarness', [quantity, name, decimals, symbol, comptroller._address]);
    await send(comptroller, '_supportMarket', [cToken._address, 0]);
    return cToken;
  } else if (kind == 'curveToken') {
    const quantity = etherUnsigned(dfn(opts.quantity, 1e25));
    const decimals = etherUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'crvIB';
    const name = opts.name || `Curve ${symbol}`;
    return await deploy('CurveTokenHarness', [quantity, name, decimals, symbol, opts.crvOpts.minter]);
  } else if (kind == 'yvaultToken') {
    const quantity = etherUnsigned(dfn(opts.quantity, 1e25));
    const decimals = etherUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'yvIB';
    const version = (opts.yvOpts && opts.yvOpts.version) || 'v1';
    const name = opts.name || `yVault ${version} ${symbol}`;

    const underlying = (opts.yvOpts && opts.yvOpts.underlying) || await makeToken();
    const price = dfn((opts.yvOpts && opts.yvOpts.price), etherMantissa(1));
    if (version == 'v1') {
      return await deploy('YVaultV1TokenHarness', [quantity, name, decimals, symbol, underlying._address, price]);
    } else {
      return await deploy('YVaultV2TokenHarness', [quantity, name, decimals, symbol, underlying._address, price]);
    }
  }
}

async function makeCurveSwap(opts = {}) {
  const price = dfn(opts.price, etherMantissa(1));
  return await deploy('CurveSwapHarness', [price]);
}

async function makeMockAggregator(opts = {}) {
  const answer = dfn(opts.answer, etherMantissa(1));
  return await deploy('MockAggregator', [answer]);
}

async function preCSLP(underlying) {
  const sushiToken = await deploy('SushiToken');
  const masterChef = await deploy('MasterChef', [sushiToken._address]);
  await send(masterChef, 'add', [1, underlying]);
  const sushiBar = await deploy('SushiBar', [sushiToken._address]);
  return encodeParameters(['address', 'address', 'uint'], [masterChef._address, sushiBar._address, 0]); // pid = 0
}

async function makeFlashloanReceiver(opts = {}) {
  const {
    kind = 'normal'
  } = opts || {};
  if (kind === 'normal') {
    return await deploy('FlashloanReceiver', [])
  }
  if (kind === 'flashloan-and-mint') {
    return await deploy('FlashloanAndMint', [])
  }
  if (kind === 'flashloan-and-repay-borrow') {
    return await deploy('FlashloanAndRepayBorrow', [])
  }
  if (kind === 'flashloan-twice') {
    return await deploy('FlashloanTwice', [])
  }
}

async function balanceOf(token, account) {
  return etherUnsigned(await call(token, 'balanceOf', [account]));
}

async function collateralTokenBalance(token, account) {
  return etherUnsigned(await call(token, 'accountCollateralTokens', [account]));
}

async function cash(token) {
  return etherUnsigned(await call(token, 'getCash', []));
}

async function totalSupply(token) {
  return etherUnsigned(await call(token, 'totalSupply'));
}

async function totalCollateralTokens(token) {
  return etherUnsigned(await call(token, 'totalCollateralTokens'));
}

async function borrowSnapshot(cToken, account) {
  const { principal, interestIndex } = await call(cToken, 'harnessAccountBorrows', [account]);
  return { principal: etherUnsigned(principal), interestIndex: etherUnsigned(interestIndex) };
}

async function totalBorrows(cToken) {
  return etherUnsigned(await call(cToken, 'totalBorrows'));
}

async function totalReserves(cToken) {
  return etherUnsigned(await call(cToken, 'totalReserves'));
}

async function enterMarkets(cTokens, from) {
  return await send(cTokens[0].comptroller, 'enterMarkets', [cTokens.map(c => c._address)], { from });
}

async function fastForward(cToken, blocks = 5) {
  return await send(cToken, 'harnessFastForward', [blocks]);
}

async function setBalance(cToken, account, balance) {
  return await send(cToken, 'harnessSetBalance', [account, balance]);
}

async function setEtherBalance(cEther, balance) {
  const current = await etherBalance(cEther._address);
  const root = saddle.account;
  expect(await send(cEther, 'harnessDoTransferOut', [root, current])).toSucceed();
  expect(await send(cEther, 'harnessDoTransferIn', [root, balance], { value: balance })).toSucceed();
}

async function getBalances(cTokens, accounts) {
  const balances = {};
  for (let cToken of cTokens) {
    const cBalances = balances[cToken._address] = {};
    for (let account of accounts) {
      cBalances[account] = {
        eth: await etherBalance(account),
        cash: cToken.underlying && await balanceOf(cToken.underlying, account),
        tokens: await balanceOf(cToken, account),
        borrows: (await borrowSnapshot(cToken, account)).principal
      };
    }
    cBalances[cToken._address] = {
      eth: await etherBalance(cToken._address),
      cash: await cash(cToken),
      tokens: await totalSupply(cToken),
      borrows: await totalBorrows(cToken),
      reserves: await totalReserves(cToken)
    };
  }
  return balances;
}

async function adjustBalances(balances, deltas) {
  for (let delta of deltas) {
    let cToken, account, key, diff;
    if (delta.length == 4) {
      ([cToken, account, key, diff] = delta);
    } else {
      ([cToken, key, diff] = delta);
      account = cToken._address;
    }
    balances[cToken._address][account][key] = balances[cToken._address][account][key].plus(diff);
  }
  return balances;
}


async function preApprove(cToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(cToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(cToken.underlying, 'approve', [cToken._address, amount], { from });
}

async function quickMint(cToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(cToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(cToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(cToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(cToken, 'mint', [mintAmount], { from: minter });
}


async function preSupply(cToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(cToken, 'harnessSetTotalSupply', [tokens])).toSucceed();
  }
  if (dfn(opts.totalCollateralTokens)) {
    expect(await send(cToken, 'harnessSetTotalCollateralTokens', [tokens])).toSucceed();
  }
  return send(cToken, 'harnessSetBalance', [account, tokens]);
}

async function quickRedeem(cToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(cToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(cToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(cToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(cToken, 'redeem', [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(cToken, redeemer, redeemAmount, opts = {}) {
  await fastForward(cToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(await send(cToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(cToken, 'redeemUnderlying', [redeemAmount], { from: redeemer });
}

async function setOraclePrice(cToken, price) {
  return send(cToken.comptroller.priceOracle, 'setUnderlyingPrice', [cToken._address, etherMantissa(price)]);
}

async function setBorrowRate(cToken, rate) {
  return send(cToken.interestRateModel, 'setBorrowRate', [etherMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
  return call(interestRateModel, 'getBorrowRate', [cash, borrows, reserves].map(etherUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
  return call(interestRateModel, 'getSupplyRate', [cash, borrows, reserves, reserveFactor].map(etherUnsigned));
}

async function pretendBorrow(cToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await send(cToken, 'harnessSetTotalBorrows', [etherUnsigned(principalRaw)]);
  await send(cToken, 'harnessSetAccountBorrows', [borrower, etherUnsigned(principalRaw), etherMantissa(accountIndex)]);
  await send(cToken, 'harnessSetBorrowIndex', [etherMantissa(marketIndex)]);
  await send(cToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(blockNumber)]);
  await send(cToken, 'harnessSetBlockNumber', [etherUnsigned(blockNumber)]);
}

module.exports = {
  makeComptroller,
  makeCToken,
  makeInterestRateModel,
  makePriceOracle,
  makeMockAggregator,
  makeFlashloanReceiver,
  makeToken,
  makeCurveSwap,

  balanceOf,
  collateralTokenBalance,
  totalSupply,
  totalCollateralTokens,
  borrowSnapshot,
  totalBorrows,
  totalReserves,
  enterMarkets,
  fastForward,
  setBalance,
  setEtherBalance,
  getBalances,
  adjustBalances,
  preCSLP,

  preApprove,
  quickMint,

  preSupply,
  quickRedeem,
  quickRedeemUnderlying,

  setOraclePrice,
  setBorrowRate,
  getBorrowRate,
  getSupplyRate,
  pretendBorrow
};
