const {
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');
const {
  makeComptroller,
  makeCToken,
  fastForward,
  quickMint,
  preApprove
} = require('../Utils/Compound');

const exchangeRate = 50e3;
const mintAmount = etherUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);

function cullTuple(tuple) {
  return Object.keys(tuple).reduce((acc, key) => {
    if (Number.isNaN(Number(key))) {
      return {
        ...acc,
        [key]: tuple[key]
      };
    } else {
      return acc;
    }
  }, {});
}

async function preMint(cToken, minter, mintAmount, mintTokens, exchangeRate) {
  await preApprove(cToken, minter, mintAmount);
  await send(cToken.comptroller, 'setMintAllowed', [true]);
  await send(cToken.comptroller, 'setMintVerify', [true]);
  await send(cToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(cToken.underlying, 'harnessSetFailTransferFromAddress', [minter, false]);
  await send(cToken, 'harnessSetBalance', [minter, 0]);
  await send(cToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

describe('CompoundLens', () => {
  let compoundLens;
  let acct;

  beforeEach(async () => {
    compoundLens = await deploy('CompoundLens');
    acct = accounts[0];
  });

  describe('cTokenMetadata', () => {
    it('is correct for a cErc20', async () => {
      let cErc20 = await makeCToken();
      expect(
        cullTuple(await call(compoundLens, 'cTokenMetadata', [cErc20._address]))
      ).toEqual(
        {
          cToken: cErc20._address,
          exchangeRateCurrent: "1000000000000000000",
          supplyRatePerBlock: "0",
          borrowRatePerBlock: "0",
          reserveFactorMantissa: "0",
          totalBorrows: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCash: "0",
          isListed:false,
          collateralFactorMantissa: "0",
          underlyingAssetAddress: await call(cErc20, 'underlying', []),
          cTokenDecimals: "8",
          underlyingDecimals: "18"
        }
      );
    });

    it('is correct for crEth', async () => {
      let crEth = await makeCToken({kind: 'cether'});
      expect(
        cullTuple(await call(compoundLens, 'cTokenMetadata', [crEth._address]))
      ).toEqual({
        borrowRatePerBlock: "0",
        cToken: crEth._address,
        cTokenDecimals: "8",
        collateralFactorMantissa: "0",
        exchangeRateCurrent: "1000000000000000000",
        isListed: false,
        reserveFactorMantissa: "0",
        supplyRatePerBlock: "0",
        totalBorrows: "0",
        totalCash: "0",
        totalReserves: "0",
        totalSupply: "0",
        underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
        underlyingDecimals: "18",
      });
    });
  });

  describe('cTokenMetadataAll', () => {
    it('is correct for a cErc20 and cEther', async () => {
      let cErc20 = await makeCToken();
      let crEth = await makeCToken({kind: 'cether'});
      expect(
        (await call(compoundLens, 'cTokenMetadataAll', [[cErc20._address, crEth._address]])).map(cullTuple)
      ).toEqual([
        {
          cToken: cErc20._address,
          exchangeRateCurrent: "1000000000000000000",
          supplyRatePerBlock: "0",
          borrowRatePerBlock: "0",
          reserveFactorMantissa: "0",
          totalBorrows: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCash: "0",
          isListed:false,
          collateralFactorMantissa: "0",
          underlyingAssetAddress: await call(cErc20, 'underlying', []),
          cTokenDecimals: "8",
          underlyingDecimals: "18"
        },
        {
          borrowRatePerBlock: "0",
          cToken: crEth._address,
          cTokenDecimals: "8",
          collateralFactorMantissa: "0",
          exchangeRateCurrent: "1000000000000000000",
          isListed: false,
          reserveFactorMantissa: "0",
          supplyRatePerBlock: "0",
          totalBorrows: "0",
          totalCash: "0",
          totalReserves: "0",
          totalSupply: "0",
          underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
          underlyingDecimals: "18",
        }
      ]);
    });
  });

  describe('cTokenBalances', () => {
    it('is correct for cERC20', async () => {
      let cErc20 = await makeCToken();
      expect(
        cullTuple(await call(compoundLens, 'cTokenBalances', [cErc20._address, acct]))
      ).toEqual(
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          cToken: cErc20._address,
          tokenAllowance: "0",
          tokenBalance: "10000000000000000000000000",
        }
      );
    });

    it('is correct for cETH', async () => {
      let cEth = await makeCToken({kind: 'cether'});
      let ethBalance = await web3.eth.getBalance(acct);
      expect(
        cullTuple(await call(compoundLens, 'cTokenBalances', [cEth._address, acct], {gasPrice: '0'}))
      ).toEqual(
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          cToken: cEth._address,
          tokenAllowance: ethBalance,
          tokenBalance: ethBalance,
        }
      );
    });
  });

  describe('cTokenBalancesAll', () => {
    it('is correct for cEth and cErc20', async () => {
      let cErc20 = await makeCToken();
      let cEth = await makeCToken({kind: 'cether'});
      let ethBalance = await web3.eth.getBalance(acct);

      expect(
        (await call(compoundLens, 'cTokenBalancesAll', [[cErc20._address, cEth._address], acct], {gasPrice: '0'})).map(cullTuple)
      ).toEqual([
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          cToken: cErc20._address,
          tokenAllowance: "0",
          tokenBalance: "10000000000000000000000000",
        },
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          cToken: cEth._address,
          tokenAllowance: ethBalance,
          tokenBalance: ethBalance,
        }
      ]);
    })
  });

  describe('cTokenUnderlyingPrice', () => {
    it('gets correct price for cErc20', async () => {
      let cErc20 = await makeCToken();
      expect(
        cullTuple(await call(compoundLens, 'cTokenUnderlyingPrice', [cErc20._address]))
      ).toEqual(
        {
          cToken: cErc20._address,
          underlyingPrice: "0",
        }
      );
    });

    it('gets correct price for cEth', async () => {
      let cEth = await makeCToken({kind: 'cether'});
      expect(
        cullTuple(await call(compoundLens, 'cTokenUnderlyingPrice', [cEth._address]))
      ).toEqual(
        {
          cToken: cEth._address,
          underlyingPrice: "1000000000000000000",
        }
      );
    });
  });

  describe('cTokenUnderlyingPriceAll', () => {
    it('gets correct price for both', async () => {
      let cErc20 = await makeCToken();
      let cEth = await makeCToken({kind: 'cether'});
      expect(
        (await call(compoundLens, 'cTokenUnderlyingPriceAll', [[cErc20._address, cEth._address]])).map(cullTuple)
      ).toEqual([
        {
          cToken: cErc20._address,
          underlyingPrice: "0",
        },
        {
          cToken: cEth._address,
          underlyingPrice: "1000000000000000000",
        }
      ]);
    });
  });

  describe('getAccountLimits', () => {
    it('gets correct values', async () => {
      let comptroller = await makeComptroller();

      expect(
        cullTuple(await call(compoundLens, 'getAccountLimits', [comptroller._address, acct]))
      ).toEqual({
        liquidity: "0",
        markets: [],
        shortfall: "0"
      });
    });
  });

  describe('comp', () => {
    let comp, currentBlock;

    beforeEach(async () => {
      currentBlock = +(await web3.eth.getBlockNumber());
      comp = await deploy('Comp', [acct]);
    });

    describe('getCompBalanceMetadata', () => {
      it('gets correct values', async () => {
        expect(
          cullTuple(await call(compoundLens, 'getCompBalanceMetadata', [comp._address, acct]))
        ).toEqual({
          balance: "9000000000000000000000000",
          delegate: "0x0000000000000000000000000000000000000000",
          votes: "0",
        });
      });
    });

    describe('getCompBalanceMetadataExt', () => {
      it('gets correct values', async () => {
        let comptroller = await makeComptroller();
        await send(comptroller, 'setCompAccrued', [acct, 5]); // harness only

        expect(
          cullTuple(await call(compoundLens, 'getCompBalanceMetadataExt', [comp._address, comptroller._address, acct]))
        ).toEqual({
          balance: "9000000000000000000000000",
          delegate: "0x0000000000000000000000000000000000000000",
          votes: "0",
          allocated: "5"
        });
      });
    });

    describe('getCompVotes', () => {
      it('gets correct values', async () => {
        expect(
          (await call(compoundLens, 'getCompVotes', [comp._address, acct, [currentBlock, currentBlock - 1]])).map(cullTuple)
        ).toEqual([
          {
            blockNumber: currentBlock.toString(),
            votes: "0",
          },
          {
            blockNumber: (Number(currentBlock) - 1).toString(),
            votes: "0",
          }
        ]);
      });

      it('reverts on future value', async () => {
        await expect(
          call(compoundLens, 'getCompVotes', [comp._address, acct, [currentBlock + 1]])
        ).rejects.toRevert('revert Comp::getPriorVotes: not yet determined')
      });
    });
  });

  describe('getClaimableSushiRewards', () => {
    let root, minter, accounts;
    let cToken;
    beforeEach(async () => {
      [root, minter, ...accounts] = saddle.accounts;
      cToken = await makeCToken({kind: 'cslp', comptrollerOpts: {kind: 'bool'}, exchangeRate});
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it('gets claimable rewards', async () => {
      const sushiAddress = await call(cToken, 'sushi', []);
      const masterChefAddress = await call(cToken, 'masterChef', []);

      const masterChef = await saddle.getContractAt('MasterChef', masterChefAddress);

      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();

      await fastForward(masterChef, 1);

      const pendingRewards = await call(compoundLens, 'getClaimableSushiRewards', [[cToken._address], sushiAddress, minter]);
      expect(pendingRewards).toEqualNumber(await call(masterChef, 'sushiPerBlock', []));
    })
  });
});
