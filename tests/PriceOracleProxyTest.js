const {
  address,
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeToken,
  makeCToken,
  makeCurveSwap,
  makePriceOracle,
  makeMockAggregator
} = require('./Utils/Compound');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, cEth, cDai, cXSushi, cOther;
  let crvLP, crvLP2, crvSwap, crvSwap2, yv1, yv1CrvLP, yv2, yv2CrvLP;
  let cCrvLP, cCrvLP2, cYv1, cYv1CrvLP, cYv2, cYv2CrvLP;

  const crvLPPrice = etherMantissa(1.01);
  const yvPrice = etherMantissa(1.01);

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    cEth = await makeCToken({kind: "cether", comptrollerOpts: {kind: "v1-no-proxy"}, supportMarket: true});
    cDai = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cOther = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cXSushi = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});

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
        cXSushi._address
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

    it("sets address of cXSushi", async () => {
      let configuredCXSUSHI = await call(oracle, "cXSushiAddress");
      expect(configuredCXSUSHI).toEqual(cXSushi._address);
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

    let setPrice = async (token, price, base) => {
      const mockAggregator = await makeMockAggregator({answer: etherMantissa(price)});
      await send(
        oracle,
        "_setAggregators",
        [[token._address], [mockAggregator._address], [base]]);
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
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeCToken({comptroller: cEth.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });

    it("gets price from chainlink", async () => {
      const price = 1;
      const base = 0; // 0: ETH

      await setPrice(cOther.underlying, price, base);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(proxyPrice).toEqual(etherMantissa(price).toFixed());
    });

    it("gets price from chainlink (USD based)", async () => {
      const price = 1;
      const base = 1; // 1: USD

      // Set USDC price to 5e26 (equal to ETH price 2000 USD).
      await send(backingOracle, "setDirectPrice", [await call(oracle, "usdcAddress"), etherMantissa(5, 1e26)]);

      await setPrice(cOther.underlying, price, base);
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
    it("set LPs successfully", async () => {
      expect(await send(oracle, "_setLPs", [[cOther._address], [true]])).toSucceed();
    });

    it("fails to set LPs for non-admin", async () => {
      await expect(send(oracle, "_setLPs", [[cOther._address], [true]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set LPs");
    });

    it("fails to set LPs for mismatched data", async () => {
      await expect(send(oracle, "_setLPs", [[cOther._address], [true, true]])).rejects.toRevert("revert mismatched data");
    });
  });

  describe("_setAggregators", () => {
    let mockAggregator;

    beforeEach(async () => {
      mockAggregator = await makeMockAggregator({answer: etherMantissa(1)});
    });

    it("set aggregators successfully", async () => {
      expect(await send(oracle, "_setAggregators", [[cOther._address], [mockAggregator._address], [0]])).toSucceed(); // 0: ETH
    });

    it("fails to set aggregators for non-admin", async () => {
      await expect(send(oracle, "_setAggregators", [[cOther._address], [mockAggregator._address], [0]], {from: accounts[0]})).rejects.toRevert("revert only the admin or guardian may set the aggregators"); // 0: ETH
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      await expect(send(oracle, "_setAggregators", [[cOther._address], [mockAggregator._address], [0]], {from: accounts[0]})).rejects.toRevert("revert guardian may only clear the aggregator"); // 0: ETH
    });

    it("fails to set aggregators for mismatched data", async () => {
      await expect(send(oracle, "_setAggregators", [[cOther._address], [], [0]])).rejects.toRevert("revert mismatched data"); // 0: ETH
      await expect(send(oracle, "_setAggregators", [[cOther._address], [mockAggregator._address], []])).rejects.toRevert("revert mismatched data"); // 0: ETH
      await expect(send(oracle, "_setAggregators", [[], [mockAggregator._address], [0]])).rejects.toRevert("revert mismatched data"); // 0: ETH
    });

    it("clear aggregators successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      expect(await send(oracle, "_setAggregators", [[cOther._address], [address(0)], [0]], {from: accounts[0]})).toSucceed(); // 0: ETH
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
