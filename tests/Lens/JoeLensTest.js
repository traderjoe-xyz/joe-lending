const { avaxUnsigned, avaxMantissa } = require("../Utils/Avalanche");
const {
  makeJoetroller,
  makeJToken,
  fastForward,
  quickMint,
  preApprove,
} = require("../Utils/BankerJoe");

const exchangeRate = 50e3;
const mintAmount = avaxUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);

function cullTuple(tuple) {
  return Object.keys(tuple).reduce((acc, key) => {
    if (Number.isNaN(Number(key))) {
      return {
        ...acc,
        [key]: tuple[key],
      };
    } else {
      return acc;
    }
  }, {});
}

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

describe("JoeLens", () => {
  let joeLens;
  let acct;

  beforeEach(async () => {
    joeLens = await deploy("JoeLens", ["jAVAX"]);
    acct = accounts[0];
  });

  describe("jTokenMetadata", () => {
    its ("returns correct values from reward lens", async () => {
      let rewardLens = await makeRewardLens();
      let jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        supportMarket: true,
      });

      await send(rewardLens, "setMarketRewards", [
        jCollateralCapErc20._address, 
        1, 
        2, 
        3, 
        4
      ])

      expect(
        cullTuple(
          await call(joeLens, "jTokenMetadata", [jCollateralCapErc20._address])
        )
      ).toEqual({
        jToken: jCollateralCapErc20._address,
        exchangeRateCurrent: "1000000000000000000",
        supplyRatePerSecond: "0",
        borrowRatePerSecond: "0",
        reserveFactorMantissa: "0",
        totalBorrows: "0",
        totalReserves: "0",
        totalSupply: "0",
        totalCash: "0",
        totalCollateralTokens: "0",
        isListed: true,
        collateralFactorMantissa: "0",
        underlyingAssetAddress: await call(
          jCollateralCapErc20,
          "underlying",
          []
        ),
        jTokenDecimals: "8",
        underlyingDecimals: "18",
        version: "1",
        collateralCap: "0",
        underlyingPrice: "0",
        supplyPaused: false,
        borrowPaused: false,
        supplyCap: "0",
        borrowCap: "0",
        supplyJoeRewardsPerSecond: "1",
        borrowJoeRewardsPerSecond: "2",
        supplyAvaxRewardsPerSecond: "3",
        borrowAvaxRewardsPerSecond: "4"
      });
    })

    it("is correct for a jErc20", async () => {
      let jErc20 = await makeJToken();
      await send(jErc20.joetroller, "_supportMarket", [jErc20._address, 0]);
      await send(jErc20.joetroller, "_setMarketSupplyCaps", [
        [jErc20._address],
        [100],
      ]);
      await send(jErc20.joetroller, "_setMarketBorrowCaps", [
        [jErc20._address],
        [200],
      ]);
      await send(jErc20.joetroller, "_setMintPaused", [jErc20._address, true]);
      await send(jErc20.joetroller, "_setBorrowPaused", [
        jErc20._address,
        true,
      ]);
      expect(
        cullTuple(await call(joeLens, "jTokenMetadata", [jErc20._address]))
      ).toEqual({
        jToken: jErc20._address,
        exchangeRateCurrent: "1000000000000000000",
        supplyRatePerSecond: "0",
        borrowRatePerSecond: "0",
        reserveFactorMantissa: "0",
        totalBorrows: "0",
        totalReserves: "0",
        totalSupply: "0",
        totalCash: "0",
        totalCollateralTokens: "0",
        isListed: true,
        collateralFactorMantissa: "0",
        underlyingAssetAddress: await call(jErc20, "underlying", []),
        jTokenDecimals: "8",
        underlyingDecimals: "18",
        version: "0",
        collateralCap: "0",
        underlyingPrice: "0",
        supplyPaused: true,
        borrowPaused: true,
        supplyCap: "100",
        borrowCap: "200",
        supplyJoeRewardsPerSecond: "0",
        borrowJoeRewardsPerSecond: "0",
        supplyAvaxRewardsPerSecond: "0",
        borrowAvaxRewardsPerSecond: "0"
      });
    });

    it("is correct for jAvax", async () => {
      let jAvax = await makeJToken({
        kind: "javax",
      });

      expect(
        cullTuple(await call(joeLens, "jTokenMetadata", [jAvax._address]))
      ).toEqual({
        borrowRatePerSecond: "0",
        jToken: jAvax._address,
        jTokenDecimals: "8",
        collateralFactorMantissa: "0",
        exchangeRateCurrent: "1000000000000000000",
        isListed: false,
        reserveFactorMantissa: "0",
        supplyRatePerSecond: "0",
        totalBorrows: "0",
        totalCash: "0",
        totalReserves: "0",
        totalSupply: "0",
        totalCollateralTokens: "0",
        underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
        underlyingDecimals: "18",
        version: "0",
        collateralCap: "0",
        underlyingPrice: "1000000000000000000",
        supplyPaused: false,
        borrowPaused: false,
        supplyCap: "0",
        borrowCap: "0",
        supplyJoeRewardsPerSecond: "0",
        borrowJoeRewardsPerSecond: "0",
        supplyAvaxRewardsPerSecond: "0",
        borrowAvaxRewardsPerSecond: "0"
      });
    });

    it("is correct for a jCollateralCapErc20", async () => {
      let jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        supportMarket: true,
      });
      expect(
        cullTuple(
          await call(joeLens, "jTokenMetadata", [jCollateralCapErc20._address])
        )
      ).toEqual({
        jToken: jCollateralCapErc20._address,
        exchangeRateCurrent: "1000000000000000000",
        supplyRatePerSecond: "0",
        borrowRatePerSecond: "0",
        reserveFactorMantissa: "0",
        totalBorrows: "0",
        totalReserves: "0",
        totalSupply: "0",
        totalCash: "0",
        totalCollateralTokens: "0",
        isListed: true,
        collateralFactorMantissa: "0",
        underlyingAssetAddress: await call(
          jCollateralCapErc20,
          "underlying",
          []
        ),
        jTokenDecimals: "8",
        underlyingDecimals: "18",
        version: "1",
        collateralCap: "0",
        underlyingPrice: "0",
        supplyPaused: false,
        borrowPaused: false,
        supplyCap: "0",
        borrowCap: "0",
        supplyJoeRewardsPerSecond: "0",
        borrowJoeRewardsPerSecond: "0",
        supplyAvaxRewardsPerSecond: "0",
        borrowAvaxRewardsPerSecond: "0"
      });
    });

    it("is correct for a jCollateralCapErc20 with collateral cap", async () => {
      let jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        supportMarket: true,
      });
      expect(
        await send(jCollateralCapErc20, "_setCollateralCap", [100])
      ).toSucceed();
      expect(
        cullTuple(
          await call(joeLens, "jTokenMetadata", [jCollateralCapErc20._address])
        )
      ).toEqual({
        jToken: jCollateralCapErc20._address,
        exchangeRateCurrent: "1000000000000000000",
        supplyRatePerSecond: "0",
        borrowRatePerSecond: "0",
        reserveFactorMantissa: "0",
        totalBorrows: "0",
        totalReserves: "0",
        totalSupply: "0",
        totalCash: "0",
        totalCollateralTokens: "0",
        isListed: true,
        collateralFactorMantissa: "0",
        underlyingAssetAddress: await call(
          jCollateralCapErc20,
          "underlying",
          []
        ),
        jTokenDecimals: "8",
        underlyingDecimals: "18",
        version: "1",
        collateralCap: "100",
        underlyingPrice: "0",
        supplyPaused: false,
        borrowPaused: false,
        supplyCap: "0",
        borrowCap: "0",
        supplyJoeRewardsPerSecond: "0",
        borrowJoeRewardsPerSecond: "0",
        supplyAvaxRewardsPerSecond: "0",
        borrowAvaxRewardsPerSecond: "0"
      });
    });

    it("is correct for a jWrappedNative", async () => {
      let jWrappedNative = await makeJToken({
        kind: "jwrapped",
        supportMarket: true,
      });
      expect(
        cullTuple(
          await call(joeLens, "jTokenMetadata", [jWrappedNative._address])
        )
      ).toEqual({
        jToken: jWrappedNative._address,
        exchangeRateCurrent: "1000000000000000000",
        supplyRatePerSecond: "0",
        borrowRatePerSecond: "0",
        reserveFactorMantissa: "0",
        totalBorrows: "0",
        totalReserves: "0",
        totalSupply: "0",
        totalCash: "0",
        totalCollateralTokens: "0",
        isListed: true,
        collateralFactorMantissa: "0",
        underlyingAssetAddress: await call(jWrappedNative, "underlying", []),
        jTokenDecimals: "8",
        underlyingDecimals: "18",
        version: "2",
        collateralCap: "0",
        underlyingPrice: "0",
        supplyPaused: false,
        borrowPaused: false,
        supplyCap: "0",
        borrowCap: "0",
        supplyJoeRewardsPerSecond: "0",
        borrowJoeRewardsPerSecond: "0",
        supplyAvaxRewardsPerSecond: "0",
        borrowAvaxRewardsPerSecond: "0"
      });
    });
  });

  describe("jTokenMetadataAll", () => {
    it("is correct for a jErc20 and jAvax", async () => {
      let joetroller = await makeJoetroller();
      let jErc20 = await makeJToken({ joetroller: joetroller });
      let jAvax = await makeJToken({ kind: "javax", joetroller: joetroller });
      let jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        supportMarket: true,
        joetroller: joetroller,
      });
      let jWrappedNative = await makeJToken({
        kind: "jwrapped",
        supportMarket: true,
        joetroller: joetroller,
      });
      expect(
        await send(jCollateralCapErc20, "_setCollateralCap", [100])
      ).toSucceed();
      expect(
        (
          await call(joeLens, "jTokenMetadataAll", [
            [
              jErc20._address,
              jAvax._address,
              jCollateralCapErc20._address,
              jWrappedNative._address,
            ],
          ])
        ).map(cullTuple)
      ).toEqual([
        {
          jToken: jErc20._address,
          exchangeRateCurrent: "1000000000000000000",
          supplyRatePerSecond: "0",
          borrowRatePerSecond: "0",
          reserveFactorMantissa: "0",
          totalBorrows: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCash: "0",
          totalCollateralTokens: "0",
          isListed: false,
          collateralFactorMantissa: "0",
          underlyingAssetAddress: await call(jErc20, "underlying", []),
          jTokenDecimals: "8",
          underlyingDecimals: "18",
          version: "0",
          collateralCap: "0",
          underlyingPrice: "0",
          supplyPaused: false,
          borrowPaused: false,
          supplyCap: "0",
          borrowCap: "0",
          supplyJoeRewardsPerSecond: "0",
          borrowJoeRewardsPerSecond: "0",
          supplyAvaxRewardsPerSecond: "0",
          borrowAvaxRewardsPerSecond: "0"
        },
        {
          borrowRatePerSecond: "0",
          jToken: jAvax._address,
          jTokenDecimals: "8",
          collateralFactorMantissa: "0",
          exchangeRateCurrent: "1000000000000000000",
          isListed: false,
          reserveFactorMantissa: "0",
          supplyRatePerSecond: "0",
          totalBorrows: "0",
          totalCash: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCollateralTokens: "0",
          underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
          underlyingDecimals: "18",
          version: "0",
          collateralCap: "0",
          underlyingPrice: "1000000000000000000",
          supplyPaused: false,
          borrowPaused: false,
          supplyCap: "0",
          borrowCap: "0",
          supplyJoeRewardsPerSecond: "0",
          borrowJoeRewardsPerSecond: "0",
          supplyAvaxRewardsPerSecond: "0",
          borrowAvaxRewardsPerSecond: "0"
        },
        {
          borrowRatePerSecond: "0",
          jToken: jCollateralCapErc20._address,
          jTokenDecimals: "8",
          collateralFactorMantissa: "0",
          exchangeRateCurrent: "1000000000000000000",
          isListed: true,
          reserveFactorMantissa: "0",
          supplyRatePerSecond: "0",
          totalBorrows: "0",
          totalCash: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCollateralTokens: "0",
          underlyingAssetAddress: await call(
            jCollateralCapErc20,
            "underlying",
            []
          ),
          underlyingDecimals: "18",
          version: "1",
          collateralCap: "100",
          underlyingPrice: "0",
          supplyPaused: false,
          borrowPaused: false,
          supplyCap: "0",
          borrowCap: "0",
          supplyJoeRewardsPerSecond: "0",
          borrowJoeRewardsPerSecond: "0",
          supplyAvaxRewardsPerSecond: "0",
          borrowAvaxRewardsPerSecond: "0"
        },
        {
          jToken: jWrappedNative._address,
          exchangeRateCurrent: "1000000000000000000",
          supplyRatePerSecond: "0",
          borrowRatePerSecond: "0",
          reserveFactorMantissa: "0",
          totalBorrows: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCash: "0",
          totalCollateralTokens: "0",
          isListed: true,
          collateralFactorMantissa: "0",
          underlyingAssetAddress: await call(jWrappedNative, "underlying", []),
          jTokenDecimals: "8",
          underlyingDecimals: "18",
          version: "2",
          collateralCap: "0",
          underlyingPrice: "0",
          supplyPaused: false,
          borrowPaused: false,
          supplyCap: "0",
          borrowCap: "0",
          supplyJoeRewardsPerSecond: "0",
          borrowJoeRewardsPerSecond: "0",
          supplyAvaxRewardsPerSecond: "0",
          borrowAvaxRewardsPerSecond: "0"
        },
      ]);
    });

    it("fails for mismatch joetroller", async () => {
      let joetroller = await makeJoetroller();
      let joetroller2 = await makeJoetroller();
      let jErc20 = await makeJToken({ joetroller: joetroller });
      let jAvax = await makeJToken({ kind: "javax", joetroller: joetroller });
      let jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        supportMarket: true,
        joetroller: joetroller2,
      }); // different joetroller
      let jWrappedNative = await makeJToken({
        kind: "jwrapped",
        supportMarket: true,
        joetroller: joetroller2,
      }); // different joetroller
      await expect(
        call(joeLens, "jTokenMetadataAll", [
          [
            jErc20._address,
            jAvax._address,
            jCollateralCapErc20._address,
            jWrappedNative._address,
          ],
        ])
      ).rejects.toRevert("revert mismatch joetroller");
    });

    it("fails for invalid input", async () => {
      await expect(call(joeLens, "jTokenMetadataAll", [[]])).rejects.toRevert(
        "revert invalid input"
      );
    });
  });

  describe("jTokenBalances", () => {
    it("is correct for jERC20", async () => {
      let jErc20 = await makeJToken();
      let avaxBalance = await web3.eth.getBalance(acct);
      expect(
        cullTuple(
          await call(joeLens, "jTokenBalances", [jErc20._address, acct], {
            gasPrice: "0",
          })
        )
      ).toEqual({
        jTokenBalance: "0",
        balanceOfUnderlyingCurrent: "0",
        borrowBalanceCurrent: "0",
        borrowValueUSD: "0",
        jToken: jErc20._address,
        underlyingTokenAllowance: "0",
        underlyingTokenBalance: "10000000000000000000000000",
        collateralEnabled: false,
        supplyValueUSD: "0",
        collateralValueUSD: "0",
      });
    });

    it("is correct for jAVAX", async () => {
      let jAvax = await makeJToken({ kind: "javax" });
      let avaxBalance = await web3.eth.getBalance(acct);
      expect(
        cullTuple(
          await call(joeLens, "jTokenBalances", [jAvax._address, acct], {
            gasPrice: "0",
          })
        )
      ).toEqual({
        jTokenBalance: "0",
        balanceOfUnderlyingCurrent: "0",
        borrowBalanceCurrent: "0",
        borrowValueUSD: "0",
        jToken: jAvax._address,
        underlyingTokenAllowance: avaxBalance,
        underlyingTokenBalance: avaxBalance,
        collateralEnabled: false,
        supplyValueUSD: "0",
        collateralValueUSD: "0",
      });
    });

    it("is correct for jCollateralCapErc20", async () => {
      let jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        joetrollerOpts: { kind: "bool" },
      });
      await send(jCollateralCapErc20, "harnessSetBalance", [acct, mintTokens]);
      await send(jCollateralCapErc20, "harnessSetCollateralBalance", [
        acct,
        mintTokens,
      ]);
      await send(jCollateralCapErc20, "harnessSetCollateralBalanceInit", [
        acct,
      ]);
      let avaxBalance = await web3.eth.getBalance(acct);
      expect(
        cullTuple(
          await call(
            joeLens,
            "jTokenBalances",
            [jCollateralCapErc20._address, acct],
            { gasPrice: "0" }
          )
        )
      ).toEqual({
        jTokenBalance: "2",
        balanceOfUnderlyingCurrent: "2",
        borrowBalanceCurrent: "0",
        borrowValueUSD: "0",
        jToken: jCollateralCapErc20._address,
        underlyingTokenAllowance: "0",
        underlyingTokenBalance: "10000000000000000000000000",
        collateralEnabled: true,
        collateralValueUSD: "2",
        supplyValueUSD: "0",
        collateralValueUSD: "0",
      });
    });
  });

  describe("jTokenBalancesAll", () => {
    it("is correct for jAvax and jErc20", async () => {
      let jErc20 = await makeJToken();
      let jAvax = await makeJToken({ kind: "javax" });
      let avaxBalance = await web3.eth.getBalance(acct);

      expect(
        (
          await call(
            joeLens,
            "jTokenBalancesAll",
            [[jErc20._address, jAvax._address], acct],
            { gasPrice: "0" }
          )
        ).map(cullTuple)
      ).toEqual([
        {
          jTokenBalance: "0",
          balanceOfUnderlyingCurrent: "0",
          borrowBalanceCurrent: "0",
          borrowValueUSD: "0",
          jToken: jErc20._address,
          underlyingTokenAllowance: "0",
          underlyingTokenBalance: "10000000000000000000000000",
          collateralEnabled: false,
          collateralValueUSD: "0",
          supplyValueUSD: "0",
        },
        {
          jTokenBalance: "0",
          balanceOfUnderlyingCurrent: "0",
          borrowBalanceCurrent: "0",
          borrowValueUSD: "0",
          jToken: jAvax._address,
          underlyingTokenAllowance: avaxBalance,
          underlyingTokenBalance: avaxBalance,
          collateralEnabled: false,
          collateralValueUSD: "0",
          supplyValueUSD: "0",
        },
      ]);
    });
  });

  describe("getAccountLimits", () => {
    it("gets correct values", async () => {
      let joetroller = await makeJoetroller();

      expect(
        cullTuple(
          await call(joeLens, "getAccountLimits", [joetroller._address, acct])
        )
      ).toEqual({
        healthFactor: "0",
        liquidity: "0",
        markets: [],
        shortfall: "0",
        totalBorrowValueUSD: "0",
        totalCollateralValueUSD: "0",
      });
    });
  });

  describe("getClaimableRewards", () => {
    let root, minter, accounts;
    let jToken;
    beforeEach(async () => {
      [root, minter, ...accounts] = saddle.accounts;
      jToken = await makeJToken({
        joetrollerOpts: { kind: "bool" },
        exchangeRate,
        supportMarket: true,
      });
      await preMint(jToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("gets claimable rewards", async () => {
      const joetroller = jToken.joetroller;
      const rewardDistributorAddress = await call(
        joetroller,
        "rewardDistributor"
      );
      const rewardDistributor = await saddle.getContractAt(
        "MockRewardDistributor",
        rewardDistributorAddress
      );
      const joeAddress = await call(rewardDistributor, "joeAddress");
      await send(rewardDistributor, "_setRewardSpeed", [
        0,
        jToken._address,
        "1000000000000000000",
      ]);

      expect(await quickMint(jToken, minter, mintAmount)).toSucceed();

      await fastForward(rewardDistributor, 10);
      const pendingRewards = await call(joeLens, "getClaimableRewards", [
        "0",
        jToken.joetroller._address,
        joeAddress,
        minter,
      ]);
      expect(pendingRewards).toEqualNumber("10000000000000000000");
    });
  });
});
