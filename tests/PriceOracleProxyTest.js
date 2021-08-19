const {
  address,
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeToken,
  makeCToken,
  makeCurveSwap,
  makePriceOracle,
  makeMockRegistry
} = require('./Utils/Compound');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, cEth, cDai, cOther;
  let crvLP, crvLP2, crvSwap, crvSwap2, yv1, yv1CrvLP, yv2, yv2CrvLP;
  let cCrvLP, cCrvLP2, cYv1, cYv1CrvLP, cYv2, cYv2CrvLP;
  let mockAggregator;

  const price = etherMantissa(1);
  const crvLPPrice = etherMantissa(1.01);
  const yvPrice = etherMantissa(1.01);

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    cEth = await makeCToken({kind: "cether", comptrollerOpts: {kind: "v1-no-proxy"}, supportMarket: true});
    cDai = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cOther = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    mockAggregator = await makeMockRegistry({answer: price});

    crvSwap = await makeCurveSwap({price: crvLPPrice});
    crvLP = await makeToken({kind: 'curveToken', symbol: 'ethCrv', name: 'Curve pool ethCrv', crvOpts: {minter: crvSwap._address}}); // ETH base
    crvSwap2 = await makeCurveSwap({price: crvLPPrice});
    crvLP2 = await makeToken({kind: 'curveToken', symbol: 'usdCrv', name: 'Curve pool usdCrv', crvOpts: {minter: crvSwap2._address}}); // USD base
    yv1 = await makeToken({kind: 'yvaultToken', yvOpts: {price: yvPrice}});
    yv1CrvLP = await makeToken({kind: 'yvaultToken', yvOpts: {underlying: crvLP, price: yvPrice}});
    yv2 = await makeToken({kind: 'yvaultToken', yvOpts: {version: 'v2', price: yvPrice}});
    yv2CrvLP = await makeToken({kind: 'yvaultToken', yvOpts: {version: 'v2', underlying: crvLP, price: yvPrice}});
    cCrvLP = await makeCToken({comptroller: cEth.comptroller, supportMarket: true, underlying: crvLP}); // ETH base
    cCrvLP2 = await makeCToken({comptroller: cEth.comptroller, supportMarket: true, underlying: crvLP2}); // USD base
    cYv1 = await makeCToken({comptroller: cEth.comptroller, supportMarket: true, underlying: yv1});
    cYv1CrvLP = await makeCToken({comptroller: cEth.comptroller, supportMarket: true, underlying: yv1CrvLP});
    cYv2 = await makeCToken({comptroller: cEth.comptroller, supportMarket: true, underlying: yv2});
    cYv2CrvLP = await makeCToken({comptroller: cEth.comptroller, supportMarket: true, underlying: yv2CrvLP});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxy',
      [
        root,
        backingOracle._address,
        cEth._address,
        mockAggregator._address
      ]
     );
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let configuredGuardian = await call(oracle, "admin");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of v1 oracle", async () => {
      let configuredOracle = await call(oracle, "v1PriceOracle");
      expect(configuredOracle).toEqual(backingOracle._address);
    });

    it("sets address of cEth", async () => {
      let configuredCEther = await call(oracle, "cEthAddress");
      expect(configuredCEther).toEqual(cEth._address);
    });

    it("sets address of registry", async () => {
      let configuredRegistry = await call(oracle, "registry");
      expect(configuredRegistry).toEqual(mockAggregator._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setAndVerifyBackingPrice = async (cToken, price) => {
      await send(
        backingOracle,
        "setUnderlyingPrice",
        [cToken._address, etherMantissa(price)]);

      let backingOraclePrice = await call(
        backingOracle,
        "assetPrices",
        [cToken.underlying._address]);

      expect(Number(backingOraclePrice)).toEqual(price * 1e18);
    };

    let readAndVerifyProxyPrice = async (token, price) =>{
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [token._address]);
      expect(Number(proxyPrice)).toEqual(price * 1e18);
    };

    let setPrice = async (token, base) => {
      await send(
        oracle,
        "_setAggregators",
        [[token._address], [base]]);
    }

    it("always returns 1e18 for cEth", async () => {
      await readAndVerifyProxyPrice(cEth, 1);
    });

    it("gets price for ETH based cCrvLP", async () => {
      expect(await send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], [crvSwap._address]])).toSucceed(); // 2: V3, 0: ETH
      let price = await call(oracle, "getUnderlyingPrice", [cCrvLP._address]);
      expect(Number(price)).toEqual(1.01 * 1e18);
    });

    it("gets price for USD based cCrvLP", async () => {
      // Set USDC price to 5e26 (equal to ETH price 2000 USD).
      await send(backingOracle, "setDirectPrice", [await call(oracle, "usdcAddress"), etherMantissa(5, 1e26)]);
      expect(await send(oracle, "_setCurveTokens", [[crvLP2._address], [2], [1], [crvSwap2._address]])).toSucceed(); // 2: V3, 1: USD
      let price = await call(oracle, "getUnderlyingPrice", [cCrvLP2._address]);
      expect(Number(price)).toEqual(0.000505 * 1e18);
    });

    it("gets price for cYv1", async () => {
      // Set underlying price to 1.
      await send(backingOracle, "setDirectPrice", [await call(yv1, "token"), etherMantissa(1)]);
      expect(await send(oracle, "_setYVaultTokens", [[yv1._address], [0]])).toSucceed(); // 0: v1
      let price = await call(oracle, "getUnderlyingPrice", [cYv1._address]);
      expect(Number(price)).toEqual(1.01 * 1e18);
    });

    it("gets price for cYv1 with curve LP underlying", async () => {
      expect(await send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], [crvSwap._address]])).toSucceed(); // 2: V3, 0: ETH
      expect(await send(oracle, "_setYVaultTokens", [[yv1CrvLP._address], [0]])).toSucceed(); // 0: v1
      let price = await call(oracle, "getUnderlyingPrice", [cYv1CrvLP._address]);
      expect(Number(price)).toEqual(1.0201 * 1e18);
    });

    it("gets price for cYv2", async () => {
      // Set underlying price to 1.
      await send(backingOracle, "setDirectPrice", [await call(yv2, "token"), etherMantissa(1)]);
      expect(await send(oracle, "_setYVaultTokens", [[yv2._address], [1]])).toSucceed(); // 1: v2
      let price = await call(oracle, "getUnderlyingPrice", [cYv2._address]);
      expect(Number(price)).toEqual(1.01 * 1e18);
    });

    it("gets price for cYv2 with curve LP underlying", async () => {
      expect(await send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], [crvSwap._address]])).toSucceed(); // 2: V3, 0: ETH
      expect(await send(oracle, "_setYVaultTokens", [[yv2CrvLP._address], [1]])).toSucceed(); // 1: v2
      let price = await call(oracle, "getUnderlyingPrice", [cYv2CrvLP._address]);
      expect(Number(price)).toEqual(1.0201 * 1e18);
    });

    it("proxies for whitelisted tokens", async () => {
      await setAndVerifyBackingPrice(cOther, 11);
      await readAndVerifyProxyPrice(cOther, 11);

      await setAndVerifyBackingPrice(cOther, 37);
      await readAndVerifyProxyPrice(cOther, 37);

      // Set denomination.
      await setPrice(cOther.underlying, 'ETH');
      // Clear denomination.
      await setPrice(cOther.underlying, '');

      await readAndVerifyProxyPrice(cOther, 37);
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeCToken({comptroller: cEth.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });

    it("gets price from chainlink", async () => {
      const base = 'ETH';

      await setPrice(cOther.underlying, base);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(proxyPrice).toEqual(price.toFixed());
    });

    it("gets price from chainlink (USD based)", async () => {
      const base = 'USD';

      // Set USDC price to 5e26 (equal to ETH price 2000 USD).
      await send(backingOracle, "setDirectPrice", [await call(oracle, "usdcAddress"), etherMantissa(5, 1e26)]);

      await setPrice(cOther.underlying, base);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(Number(proxyPrice)).toEqual(0.0005 * 1e18);
    });
  });

  describe("_setAdmin", () => {
    it("set admin successfully", async () => {
      expect(await send(oracle, "_setAdmin", [accounts[0]])).toSucceed();
    });

    it("fails to set admin for non-admin", async () => {
      await expect(send(oracle, "_setAdmin", [accounts[0]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set new admin");
    });
  });

  describe("_setGuardian", () => {
    it("set guardian successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
    });

    it("fails to set guardian for non-admin", async () => {
      await expect(send(oracle, "_setGuardian", [accounts[0]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set new guardian");
    });
  });

  describe("_setLPs", () => {
    let lp, token;

    beforeEach(async () => {
      lp = await makeToken({kind: 'lp'});
      token = await makeToken();
    });

    it("set LPs successfully", async () => {
      expect(await send(oracle, "_setLPs", [[lp._address], [true]])).toSucceed();
    });

    it("fails to set LPs for non-admin", async () => {
      await expect(send(oracle, "_setLPs", [[lp._address], [true]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set LPs");
    });

    it("fails to set LPs for mismatched data", async () => {
      await expect(send(oracle, "_setLPs", [[lp._address], [true, true]])).rejects.toRevert("revert mismatched data");
    });

    it("fails to set LPs for sanity check failed", async () => {
      await expect(send(oracle, "_setLPs", [[token._address], [true]])).rejects.toRevert("revert");
    });
  });

  describe("_setAggregators", () => {
    const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const btcAddress = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
    const usdAddress = '0x0000000000000000000000000000000000000348';
    const wbtcAddress = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';

    let token;

    beforeEach(async () => {
      token = await makeToken();
    });

    it("set aggregators successfully", async () => {
      // token - ETH
      expect(await send(oracle, "_setAggregators", [[token._address], ['ETH']])).toSucceed();

      let aggregator = await call(oracle, "aggregators", [token._address]);
      expect(aggregator.base).toEqual(token._address);
      expect(aggregator.quote).toEqual(ethAddress);
      expect(aggregator.isUsed).toEqual(true);

      // token - USD
      expect(await send(oracle, "_setAggregators", [[token._address], ['USD']])).toSucceed();

      aggregator = await call(oracle, "aggregators", [token._address]);
      expect(aggregator.base).toEqual(token._address);
      expect(aggregator.quote).toEqual(usdAddress);
      expect(aggregator.isUsed).toEqual(true);

      // BTC - ETH
      expect(await send(oracle, "_setAggregators", [[wbtcAddress], ['ETH']])).toSucceed();

      aggregator = await call(oracle, "aggregators", [wbtcAddress]);
      expect(aggregator.base).toEqual(btcAddress);
      expect(aggregator.quote).toEqual(ethAddress);
      expect(aggregator.isUsed).toEqual(true);
    });

    it("fails to set aggregators for non-admin", async () => {
      await expect(send(oracle, "_setAggregators", [[token._address], ['ETH']], {from: accounts[0]})).rejects.toRevert("revert only the admin or guardian may set the aggregators");
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      await expect(send(oracle, "_setAggregators", [[token._address], ['ETH']], {from: accounts[0]})).rejects.toRevert("revert guardian may only clear the aggregator");
    });

    it("fails to set aggregators for mismatched data", async () => {
      await expect(send(oracle, "_setAggregators", [[token._address], []])).rejects.toRevert("revert mismatched data");
      await expect(send(oracle, "_setAggregators", [[], ['ETH']])).rejects.toRevert("revert mismatched data");
    });

    it("fails to set aggregators for unsupported denomination", async () => {
      await expect(send(oracle, "_setAggregators", [[token._address], ['ABC']])).rejects.toRevert("revert unsupported denomination");
    });

    it("fails to set aggregators for aggregator not enabled", async () => {
      await send(mockAggregator, 'setFeedDisabled', [true]);
      await expect(send(oracle, "_setAggregators", [[token._address], ['ETH']])).rejects.toRevert("revert aggregator not enabled");
    });

    it("clear aggregators successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      expect(await send(oracle, "_setAggregators", [[token._address], ['']], {from: accounts[0]})).toSucceed();

      const aggregator = await call(oracle, "aggregators", [token._address]);
      expect(aggregator.base).toEqual(address(0));
      expect(aggregator.quote).toEqual(address(0));
      expect(aggregator.isUsed).toEqual(false);
    });
  });

  describe("_setYVaultTokens", () => {
    it("set yv tokens successfully", async () => {
      expect(await send(oracle, "_setYVaultTokens", [[yv1._address], [0]])).toSucceed(); // 0: v1
    });

    it("fails to set yv tokens for non-admin", async () => {
      await expect(send(oracle, "_setYVaultTokens", [[yv1._address], [0]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set Yvault tokens"); // 0: v1
    });

    it("fails to set yv tokens for mismatched data", async () => {
      await expect(send(oracle, "_setYVaultTokens", [[yv1._address], []])).rejects.toRevert("revert mismatched data");
    });

    it("fails to set yv tokens for invalid version", async () => {
      await expect(send(oracle, "_setYVaultTokens", [[yv1._address], [2]])).rejects.toRevert("revert");
    });

    it("fails to set yv tokens for mismatched version", async () => {
      await expect(send(oracle, "_setYVaultTokens", [[yv1._address], [1]])).rejects.toRevert("revert"); // 1: v2
      await expect(send(oracle, "_setYVaultTokens", [[yv2._address], [0]])).rejects.toRevert("revert"); // 0: v1
    });
  });

  describe("_setCurveTokens", () => {
    it("set curve pool tokens successfully", async () => {
      expect(await send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], [crvSwap._address]])).toSucceed(); // 2: V3, 0: ETH
    });

    it("fails to set yv tokens for non-admin", async () => {
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], [crvSwap._address]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set curve pool tokens"); // 2: V3, 0: ETH
    });

    it("fails to set yv tokens for mismatched data", async () => {
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], []])).rejects.toRevert("revert mismatched data"); // 2: V3, 0: ETH
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [2], [], [crvSwap._address]])).rejects.toRevert("revert mismatched data"); // 2: V3, 0: ETH
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [], [0], [crvSwap._address]])).rejects.toRevert("revert mismatched data"); // 2: V3, 0: ETH
      await expect(send(oracle, "_setCurveTokens", [[], [2], [0], [crvSwap._address]])).rejects.toRevert("revert mismatched data"); // 2: V3, 0: ETH
    });

    it("fails to set yv tokens for invalid pool type", async () => {
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [2], [2], [crvSwap._address]])).rejects.toRevert("revert");
    });

    it("fails to set yv tokens for invalid version", async () => {
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [3], [0], [crvSwap._address]])).rejects.toRevert("revert");
    });

    it("fails to set yv tokens for incorrect pool", async () => {
      await expect(send(oracle, "_setCurveTokens", [[crvLP._address], [2], [0], [crvSwap2._address]])).rejects.toRevert("revert incorrect pool"); // 2: V3, 0: ETH
    });
  });
});
