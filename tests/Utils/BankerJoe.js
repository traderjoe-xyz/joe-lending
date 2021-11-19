"use strict";

const { dfn } = require("./JS");
const {
  encodeParameters,
  avaxBalance,
  avaxMantissa,
  avaxUnsigned,
  mergeInterface,
} = require("./Avalanche");

async function makeJoetroller(opts = {}) {
  const { root = saddle.account, kind = "unitroller" } = opts || {};

  if (kind == "bool") {
    const joetroller = await deploy("BoolJoetroller");
    const priceOracle =
      opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const rewardDistributor = await makeRewardDistributor();

    await send(joetroller, "_setPriceOracle", [priceOracle._address]);
    await send(joetroller, "_setRewardDistributor", [
      rewardDistributor._address,
    ]);
    return Object.assign(joetroller, { priceOracle });
  }

  if (kind == "false-marker") {
    return await deploy("FalseMarkerMethodJoetroller");
  }

  if (kind == "v1-no-proxy") {
    const joetroller = await deploy("JoetrollerHarness");
    const priceOracle =
      opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const closeFactor = avaxMantissa(dfn(opts.closeFactor, 0.051));
    const rewardDistributor = await makeRewardDistributor();

    await send(joetroller, "_setCloseFactor", [closeFactor]);
    await send(joetroller, "_setPriceOracle", [priceOracle._address]);
    await send(joetroller, "_setRewardDistributor", [
      rewardDistributor._address,
    ]);

    return Object.assign(joetroller, { priceOracle });
  }

  if (kind == "banker-joe") {
    const unitroller = opts.unitroller || (await deploy("Unitroller"));
    const joetroller = await deploy("BankerJoeJoetrollerHarness");
    const priceOracle =
      opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const closeFactor = avaxMantissa(dfn(opts.closeFactor, 0.051));
    const liquidationIncentive = avaxMantissa(1);
    const joe = opts.joe || (await deploy("Joe", [opts.joeOwner || root]));
    const rewardDistributor = await makeRewardDistributor();

    await send(unitroller, "_setPendingImplementation", [joetroller._address]);
    await send(joetroller, "_become", [unitroller._address]);
    mergeInterface(unitroller, joetroller);
    await send(unitroller, "_setLiquidationIncentive", [liquidationIncentive]);
    await send(unitroller, "_setCloseFactor", [closeFactor]);
    await send(unitroller, "_setPriceOracle", [priceOracle._address]);
    await send(unitroller, "setJoeAddress", [joe._address]); // harness only
    await send(unitroller, "_setRewardDistributor", [
      rewardDistributor._address,
    ]);

    return Object.assign(unitroller, { priceOracle, joe });
  }

  if (kind == "unitroller") {
    const unitroller = opts.unitroller || (await deploy("Unitroller"));
    const joetroller = await deploy("JoetrollerHarness");
    const priceOracle =
      opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const rewardDistributor = await makeRewardDistributor();
    const closeFactor = avaxMantissa(dfn(opts.closeFactor, 0.051));
    const liquidationIncentive = avaxMantissa(1);

    await send(unitroller, "_setPendingImplementation", [joetroller._address]);
    await send(joetroller, "_become", [unitroller._address]);
    mergeInterface(unitroller, joetroller);
    await send(unitroller, "_setLiquidationIncentive", [liquidationIncentive]);
    await send(unitroller, "_setCloseFactor", [closeFactor]);
    await send(unitroller, "_setPriceOracle", [priceOracle._address]);
    await send(unitroller, "_setRewardDistributor", [
      rewardDistributor._address,
    ]);

    return Object.assign(unitroller, { priceOracle });
  }
}

async function makeJToken(opts = {}) {
  const { root = saddle.account, kind = "jerc20" } = opts || {};

  const joetroller =
    opts.joetroller || (await makeJoetroller(opts.joetrollerOpts));
  const interestRateModel =
    opts.interestRateModel ||
    (await makeInterestRateModel(opts.interestRateModelOpts));
  const exchangeRate = avaxMantissa(dfn(opts.exchangeRate, 1));
  const decimals = avaxUnsigned(dfn(opts.decimals, 8));
  const symbol = opts.symbol || (kind === "javax" ? "jAVAX" : "jOMG");
  const name = opts.name || `JToken ${symbol}`;
  const admin = opts.admin || root;

  let jToken, underlying;
  let jDelegator, jDelegatee;
  let version = 0;

  switch (kind) {
    case "javax":
      jToken = await deploy("JAvaxHarness", [
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
      ]);
      break;

    case "jcapable":
      underlying = opts.underlying || (await makeToken(opts.underlyingOpts));
      jDelegatee = await deploy("JCapableErc20Delegate");
      jDelegator = await deploy("JErc20Delegator", [
        underlying._address,
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        jDelegatee._address,
        "0x0",
      ]);
      jToken = await saddle.getContractAt(
        "JCapableErc20Delegate",
        jDelegator._address
      );
      break;

    case "jcollateralcap":
      underlying = opts.underlying || (await makeToken(opts.underlyingOpts));
      jDelegatee = await deploy("JCollateralCapErc20DelegateHarness");
      jDelegator = await deploy("JCollateralCapErc20Delegator", [
        underlying._address,
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        jDelegatee._address,
        "0x0",
      ]);
      jToken = await saddle.getContractAt(
        "JCollateralCapErc20DelegateHarness",
        jDelegator._address
      );
      version = 1; // jcollateralcap's version is 1
      break;

    case "jjlp":
      underlying = opts.underlying || (await makeToken(opts.underlyingOpts));
      const joeToken = await deploy("JoeToken");
      const masterChef = await deploy("MasterChef", [joeToken._address]);
      await send(masterChef, "add", [1, underlying._address]);
      const joeBar = await deploy("JoeBar", [joeToken._address]);

      jDelegatee = await deploy("JJLPDelegateHarness");
      jDelegator = await deploy("JErc20Delegator", [
        underlying._address,
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        jDelegatee._address,
        encodeParameters(
          ["address", "address", "uint"],
          [masterChef._address, joeBar._address, 0]
        ), // pid = 0
      ]);
      jToken = await saddle.getContractAt(
        "JJLPDelegateHarness",
        jDelegator._address
      ); // XXXS at
      break;

    case "jjtoken":
      underlying = opts.underlying || (await makeToken({ kind: "jtoken" }));
      jDelegatee = await deploy("JJTokenDelegateHarness");
      jDelegator = await deploy("JErc20Delegator", [
        underlying._address,
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        jDelegatee._address,
        "0x0",
      ]);
      jToken = await saddle.getContractAt(
        "JJTokenDelegateHarness",
        jDelegator._address
      ); // XXXS at
      break;

    case "jwrapped":
      underlying = await makeToken({ kind: "wrapped" });
      jDelegatee = await deploy("JWrappedNativeDelegateHarness");
      jDelegator = await deploy("JWrappedNativeDelegator", [
        underlying._address,
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        jDelegatee._address,
        "0x0",
      ]);
      jToken = await saddle.getContractAt(
        "JWrappedNativeDelegateHarness",
        jDelegator._address
      ); // XXXS at
      version = 2; // cwrappednative's version is 2
      break;

    case "jerc20":
    default:
      underlying = opts.underlying || (await makeToken(opts.underlyingOpts));
      jDelegatee = await deploy("JErc20DelegateHarness");
      jDelegator = await deploy("JErc20Delegator", [
        underlying._address,
        joetroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        jDelegatee._address,
        "0x0",
      ]);
      jToken = await saddle.getContractAt(
        "JErc20DelegateHarness",
        jDelegator._address
      ); // XXXS at
      break;
  }

  if (opts.supportMarket) {
    await send(joetroller, "_supportMarket", [jToken._address, version]);
  }

  if (opts.underlyingPrice) {
    const price = avaxMantissa(opts.underlyingPrice);
    await send(joetroller.priceOracle, "setUnderlyingPrice", [
      jToken._address,
      price,
    ]);
  }

  if (opts.collateralFactor) {
    const factor = avaxMantissa(opts.collateralFactor);
    expect(
      await send(joetroller, "_setCollateralFactor", [jToken._address, factor])
    ).toSucceed();
  }

  return Object.assign(jToken, {
    name,
    symbol,
    underlying,
    joetroller,
    interestRateModel,
  });
}

async function makeInterestRateModel(opts = {}) {
  const { root = saddle.account, kind = "harnessed" } = opts || {};

  if (kind == "harnessed") {
    const borrowRate = avaxMantissa(dfn(opts.borrowRate, 0));
    return await deploy("InterestRateModelHarness", [borrowRate]);
  }

  if (kind == "false-marker") {
    const borrowRate = avaxMantissa(dfn(opts.borrowRate, 0));
    return await deploy("FalseMarkerMethodInterestRateModel", [borrowRate]);
  }

  if (kind == "jump-rate") {
    const baseRate = avaxMantissa(dfn(opts.baseRate, 0));
    const multiplier = avaxMantissa(dfn(opts.multiplier, 1e-18));
    const jump = avaxMantissa(dfn(opts.jump, 0));
    const kink = avaxMantissa(dfn(opts.kink, 1));
    const roof = avaxMantissa(dfn(opts.roof, 1));
    return await deploy("JumpRateModelV2", [
      baseRate,
      multiplier,
      jump,
      kink,
      roof,
      root,
    ]);
  }

  if (kind == "triple-slope") {
    const baseRate = avaxMantissa(dfn(opts.baseRate, 0));
    const multiplier = avaxMantissa(dfn(opts.multiplier, 0.1));
    const jump = avaxMantissa(dfn(opts.jump, 0));
    const kink1 = avaxMantissa(dfn(opts.kink1, 1));
    const kink2 = avaxMantissa(dfn(opts.kink2, 1));
    const roof = avaxMantissa(dfn(opts.roof, 1));
    return await deploy("TripleSlopeRateModel", [
      baseRate,
      multiplier,
      jump,
      kink1,
      kink2,
      roof,
      root,
    ]);
  }
}

async function makePriceOracle(opts = {}) {
  const { root = saddle.account, kind = "simple" } = opts || {};

  if (kind == "simple") {
    return await deploy("SimplePriceOracle");
  }
}

async function makeMockReference(opts = {}) {
  return await deploy("MockReference");
}

async function makeJTokenAdmin(opts = {}) {
  const { root = saddle.account } = opts || {};

  const admin = opts.admin || root;
  return await deploy("JTokenAdmin", [admin]);
}

async function makeToken(opts = {}) {
  const { root = saddle.account, kind = "erc20" } = opts || {};

  if (kind == "erc20") {
    const quantity = avaxUnsigned(dfn(opts.quantity, 1e25));
    const decimals = avaxUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "OMG";
    const name = opts.name || `Erc20 ${symbol}`;
    return await deploy("ERC20Harness", [quantity, name, decimals, symbol]);
  } else if (kind == "jtoken") {
    const quantity = avaxUnsigned(dfn(opts.quantity, 1e25));
    const decimals = avaxUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "jOMG";
    const name = opts.name || `Banker Joe ${symbol}`;

    const joetroller = await makeJoetroller({ kind: "banker-joe" });
    const jToken = await deploy("JTokenHarness", [
      quantity,
      name,
      decimals,
      symbol,
      joetroller._address,
    ]);
    await send(joetroller, "_supportMarket", [jToken._address, 0]);
    return jToken;
  } else if (kind == "curveToken") {
    const quantity = avaxUnsigned(dfn(opts.quantity, 1e25));
    const decimals = avaxUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "crvIB";
    const name = opts.name || `Curve ${symbol}`;
    return await deploy("CurveTokenHarness", [
      quantity,
      name,
      decimals,
      symbol,
      opts.crvOpts.minter,
    ]);
  } else if (kind == "yvaultToken") {
    const quantity = avaxUnsigned(dfn(opts.quantity, 1e25));
    const decimals = avaxUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "yvIB";
    const version = (opts.yvOpts && opts.yvOpts.version) || "v1";
    const name = opts.name || `yVault ${version} ${symbol}`;

    const underlying =
      (opts.yvOpts && opts.yvOpts.underlying) || (await makeToken());
    const price = dfn(opts.yvOpts && opts.yvOpts.price, avaxMantissa(1));
    if (version == "v1") {
      return await deploy("YVaultV1TokenHarness", [
        quantity,
        name,
        decimals,
        symbol,
        underlying._address,
        price,
      ]);
    } else {
      return await deploy("YVaultV2TokenHarness", [
        quantity,
        name,
        decimals,
        symbol,
        underlying._address,
        price,
      ]);
    }
  } else if (kind == "wrapped") {
    return await deploy("WAVAX9");
  } else if (kind == "nonstandard") {
    const quantity = avaxUnsigned(dfn(opts.quantity, 1e25));
    const decimals = avaxUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "MITH";
    const name = opts.name || `Erc20 ${symbol}`;
    return await deploy("FaucetNonStandardToken", [
      quantity,
      name,
      decimals,
      symbol,
    ]);
  } else if (kind == "lp") {
    const quantity = avaxUnsigned(dfn(opts.quantity, 1e25));
    const decimals = avaxUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "UNI-V2-LP";
    const name = opts.name || `Uniswap v2 LP`;
    return await deploy("LPTokenHarness", [quantity, name, decimals, symbol]);
  }
}

async function makeCurveSwap(opts = {}) {
  const price = dfn(opts.price, avaxMantissa(1));
  return await deploy("CurveSwapHarness", [price]);
}

async function makeMockAggregator(opts = {}) {
  const answer = dfn(opts.answer, avaxMantissa(1));
  return await deploy("MockAggregator", [answer]);
}

async function makeMockRegistry(opts = {}) {
  const answer = dfn(opts.answer, avaxMantissa(1));
  return await deploy("MockRegistry", [answer]);
}

async function makeRewardDistributor(opts = {}) {
  const { root = saddle.account } = opts || {};
  const rewardDistributor = await deploy("MockRewardDistributor", []);
  const joe = await deploy("Joe", [opts.joeOwner || root]);
  await send(rewardDistributor, "setJoeAddress", [joe._address]);
  await send(joe, "transfer", [
    rewardDistributor._address,
    "500000000000000000000",
  ]);
  return rewardDistributor;
}

async function preJJLP(underlying) {
  const joeToken = await deploy("JoeToken");
  const masterChef = await deploy("MasterChef", [joeToken._address]);
  await send(masterChef, "add", [1, underlying]);
  const joeBar = await deploy("JoeBar", [joeToken._address]);
  return encodeParameters(
    ["address", "address", "uint"],
    [masterChef._address, joeBar._address, 0]
  ); // pid = 0
}

async function makeFlashloanReceiver(opts = {}) {
  const { kind = "normal" } = opts || {};
  if (kind === "normal") {
    return await deploy("FlashloanReceiver", []);
  }
  if (kind === "flashloan-and-mint") {
    return await deploy("FlashloanAndMint", []);
  }
  if (kind === "flashloan-and-repay-borrow") {
    return await deploy("FlashloanAndRepayBorrow", []);
  }
  if (kind === "flashloan-twice") {
    return await deploy("FlashloanTwice", []);
  }
  if (kind === "native") {
    return await deploy("FlashloanReceiverNative");
  }
  if (kind === "flashloan-and-mint-native") {
    return await deploy("FlashloanAndMintNative");
  }
  if (kind === "flashloan-and-repay-borrow-native") {
    return await deploy("FlashloanAndRepayBorrowNative");
  }
  if (kind === "flashloan-twice-native") {
    return await deploy("FlashloanTwiceNative");
  }
}

async function balanceOf(token, account) {
  return avaxUnsigned(await call(token, "balanceOf", [account]));
}

async function collateralTokenBalance(token, account) {
  return avaxUnsigned(await call(token, "accountCollateralTokens", [account]));
}

async function cash(token) {
  return avaxUnsigned(await call(token, "getCash", []));
}

async function totalSupply(token) {
  return avaxUnsigned(await call(token, "totalSupply"));
}

async function totalCollateralTokens(token) {
  return avaxUnsigned(await call(token, "totalCollateralTokens"));
}

async function borrowSnapshot(jToken, account) {
  const { principal, interestIndex } = await call(
    jToken,
    "harnessAccountBorrows",
    [account]
  );
  return {
    principal: avaxUnsigned(principal),
    interestIndex: avaxUnsigned(interestIndex),
  };
}

async function totalBorrows(jToken) {
  return avaxUnsigned(await call(jToken, "totalBorrows"));
}

async function totalReserves(jToken) {
  return avaxUnsigned(await call(jToken, "totalReserves"));
}

async function enterMarkets(jTokens, from) {
  return await send(
    jTokens[0].joetroller,
    "enterMarkets",
    [jTokens.map((c) => c._address)],
    { from }
  );
}

async function fastForward(jToken, blocks = 5) {
  return await send(jToken, "harnessFastForward", [blocks]);
}

async function setBalance(jToken, account, balance) {
  return await send(jToken, "harnessSetBalance", [account, balance]);
}

async function setAvaxBalance(jAvax, balance) {
  const current = await avaxBalance(jAvax._address);
  const root = saddle.account;
  expect(
    await send(jAvax, "harnessDoTransferOut", [root, current])
  ).toSucceed();
  expect(
    await send(jAvax, "harnessDoTransferIn", [root, balance], {
      value: balance,
    })
  ).toSucceed();
}

async function getBalances(jTokens, accounts) {
  const balances = {};
  for (let jToken of jTokens) {
    const jBalances = (balances[jToken._address] = {});
    for (let account of accounts) {
      jBalances[account] = {
        avax: await avaxBalance(account),
        cash:
          jToken.underlying && (await balanceOf(jToken.underlying, account)),
        tokens: await balanceOf(jToken, account),
        borrows: (await borrowSnapshot(jToken, account)).principal,
      };
    }
    jBalances[jToken._address] = {
      avax: await avaxBalance(jToken._address),
      cash: await cash(jToken),
      tokens: await totalSupply(jToken),
      borrows: await totalBorrows(jToken),
      reserves: await totalReserves(jToken),
    };
  }
  return balances;
}

async function adjustBalances(balances, deltas) {
  for (let delta of deltas) {
    let jToken, account, key, diff;
    if (delta.length == 4) {
      [jToken, account, key, diff] = delta;
    } else {
      [jToken, key, diff] = delta;
      account = jToken._address;
    }
    balances[jToken._address][account][key] =
      balances[jToken._address][account][key].plus(diff);
  }
  return balances;
}

async function preApprove(jToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(
      await send(jToken.underlying, "harnessSetBalance", [from, amount], {
        from,
      })
    ).toSucceed();
  }

  return send(jToken.underlying, "approve", [jToken._address, amount], {
    from,
  });
}

async function quickMint(jToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(jToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(jToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(
      await send(jToken, "harnessSetExchangeRate", [
        avaxMantissa(opts.exchangeRate),
      ])
    ).toSucceed();
  }
  return send(jToken, "mint", [mintAmount], { from: minter });
}

async function preSupply(jToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(jToken, "harnessSetTotalSupply", [tokens])).toSucceed();
  }
  if (dfn(opts.totalCollateralTokens)) {
    expect(
      await send(jToken, "harnessSetTotalCollateralTokens", [tokens])
    ).toSucceed();
  }
  return send(jToken, "harnessSetBalance", [account, tokens]);
}

async function quickRedeem(jToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(jToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(jToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(
      await send(jToken, "harnessSetExchangeRate", [
        avaxMantissa(opts.exchangeRate),
      ])
    ).toSucceed();
  }
  return send(jToken, "redeem", [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(
  jToken,
  redeemer,
  redeemAmount,
  opts = {}
) {
  await fastForward(jToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(
      await send(jToken, "harnessSetExchangeRate", [
        avaxMantissa(opts.exchangeRate),
      ])
    ).toSucceed();
  }
  return send(jToken, "redeemUnderlying", [redeemAmount], { from: redeemer });
}

async function setOraclePrice(jToken, price) {
  return send(jToken.joetroller.priceOracle, "setUnderlyingPrice", [
    jToken._address,
    avaxMantissa(price),
  ]);
}

async function setBorrowRate(jToken, rate) {
  return send(jToken.interestRateModel, "setBorrowRate", [avaxMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
  return call(
    interestRateModel,
    "getBorrowRate",
    [cash, borrows, reserves].map(avaxUnsigned)
  );
}

async function getSupplyRate(
  interestRateModel,
  cash,
  borrows,
  reserves,
  reserveFactor
) {
  return call(
    interestRateModel,
    "getSupplyRate",
    [cash, borrows, reserves, reserveFactor].map(avaxUnsigned)
  );
}

async function pretendBorrow(
  jToken,
  borrower,
  accountIndex,
  marketIndex,
  principalRaw,
  blockTimestamp = 2e7
) {
  await send(jToken, "harnessSetTotalBorrows", [avaxUnsigned(principalRaw)]);
  await send(jToken, "harnessSetAccountBorrows", [
    borrower,
    avaxUnsigned(principalRaw),
    avaxMantissa(accountIndex),
  ]);
  await send(jToken, "harnessSetBorrowIndex", [avaxMantissa(marketIndex)]);
  await send(jToken, "harnessSetAccrualBlockTimestamp", [
    avaxUnsigned(blockTimestamp),
  ]);
  await send(jToken, "harnessSetBlockTimestamp", [
    avaxUnsigned(blockTimestamp),
  ]);
}

module.exports = {
  makeJoetroller,
  makeJToken,
  makeInterestRateModel,
  makePriceOracle,
  makeMockAggregator,
  makeMockReference,
  makeMockRegistry,
  makeFlashloanReceiver,
  makeToken,
  makeCurveSwap,
  makeRewardDistributor,
  makeJTokenAdmin,

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
  setAvaxBalance,
  getBalances,
  adjustBalances,
  preJJLP,

  preApprove,
  quickMint,

  preSupply,
  quickRedeem,
  quickRedeemUnderlying,

  setOraclePrice,
  setBorrowRate,
  getBorrowRate,
  getSupplyRate,
  pretendBorrow,
};
