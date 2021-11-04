const { avaxUnsigned, avaxMantissa } = require("../Utils/Avalanche");

const {
  makeJToken,
  preApprove,
  balanceOf,
  fastForward,
} = require("../Utils/BankerJoe");

const exchangeRate = 50e3;
const mintAmount = avaxUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);

async function preMint(jToken, minter, mintAmount, exchangeRate) {
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

async function mintFresh(jToken, minter, mintAmount) {
  return send(jToken, "harnessMintFresh", [minter, mintAmount]);
}

describe("JToken", function () {
  let root, minter, accounts;
  beforeEach(async () => {
    [root, minter, ...accounts] = saddle.accounts;
  });

  describe("transfer", () => {
    it("cannot transfer from a zero balance", async () => {
      const jToken = await makeJToken({ supportMarket: true });
      expect(await call(jToken, "balanceOf", [root])).toEqualNumber(0);
      await expect(
        send(jToken, "transfer", [accounts[0], 100])
      ).rejects.toRevert("revert subtraction underflow");
    });

    it("transfers 50 tokens", async () => {
      const jToken = await makeJToken({ supportMarket: true });
      await send(jToken, "harnessSetBalance", [root, 100]);
      expect(await call(jToken, "balanceOf", [root])).toEqualNumber(100);
      await send(jToken, "transfer", [accounts[0], 50]);
      expect(await call(jToken, "balanceOf", [root])).toEqualNumber(50);
      expect(await call(jToken, "balanceOf", [accounts[0]])).toEqualNumber(50);
    });

    it("doesn't transfer when src == dst", async () => {
      const jToken = await makeJToken({ supportMarket: true });
      await send(jToken, "harnessSetBalance", [root, 100]);
      expect(await call(jToken, "balanceOf", [root])).toEqualNumber(100);
      expect(await send(jToken, "transfer", [root, 50])).toHaveTokenFailure(
        "BAD_INPUT",
        "TRANSFER_NOT_ALLOWED"
      );
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      const jToken = await makeJToken({ joetrollerOpts: { kind: "bool" } });
      await send(jToken, "harnessSetBalance", [root, 100]);
      expect(await call(jToken, "balanceOf", [root])).toEqualNumber(100);

      await send(jToken.joetroller, "setTransferAllowed", [false]);
      expect(await send(jToken, "transfer", [root, 50])).toHaveTrollReject(
        "TRANSFER_JOETROLLER_REJECTION"
      );

      await send(jToken.joetroller, "setTransferAllowed", [true]);
      await send(jToken.joetroller, "setTransferVerify", [false]);
      // no longer support verifyTransfer on jToken end
      // await expect(send(jToken, 'transfer', [accounts[0], 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });

    it("transfers jjlp token", async () => {
      const jToken = await makeJToken({
        kind: "jjlp",
        joetrollerOpts: { kind: "bool" },
      });
      const joeAddress = await call(jToken, "joe", []);
      const masterChefAddress = await call(jToken, "masterChef", []);

      const joe = await saddle.getContractAt("JoeToken", joeAddress);
      const masterChef = await saddle.getContractAt(
        "MasterChef",
        masterChefAddress
      );

      await preMint(jToken, minter, mintAmount, exchangeRate);
      expect(await mintFresh(jToken, minter, mintAmount)).toSucceed();
      expect(await call(jToken, "balanceOf", [minter])).toEqualNumber(
        mintTokens
      );

      await fastForward(jToken, 1);
      await fastForward(masterChef, 1);

      await send(jToken, "transfer", [accounts[0], mintTokens], {
        from: minter,
      });
      expect(await call(jToken, "balanceOf", [minter])).toEqualNumber(0);
      expect(await call(jToken, "balanceOf", [accounts[0]])).toEqualNumber(
        mintTokens
      );

      expect(await balanceOf(joe, minter)).toEqualNumber(avaxMantissa(0));
      expect(await call(jToken, "xJoeUserAccrued", [minter])).toEqualNumber(
        avaxMantissa(1)
      );

      await fastForward(jToken, 1);
      await fastForward(masterChef, 1);

      await send(jToken, "claimJoe", [minter], { from: minter });
      expect(await balanceOf(joe, minter)).toEqualNumber(avaxMantissa(1));
      expect(await call(jToken, "xJoeUserAccrued", [minter])).toEqualNumber(
        avaxMantissa(0)
      );
    });

    describe("transfer jcollateralcap token", () => {
      it("transfers collateral tokens", async () => {
        const jToken = await makeJToken({
          kind: "jcollateralcap",
          supportMarket: true,
        });
        await send(jToken, "harnessSetBalance", [root, 100]);
        await send(jToken, "harnessSetCollateralBalance", [root, 100]);
        await send(jToken, "harnessSetTotalSupply", [100]);
        await send(jToken, "harnessSetTotalCollateralTokens", [100]);

        expect(await call(jToken, "balanceOf", [root])).toEqualNumber(100);
        expect(
          await call(jToken, "accountCollateralTokens", [root])
        ).toEqualNumber(100);
        await send(jToken, "transfer", [accounts[0], 50]);
        expect(await call(jToken, "balanceOf", [root])).toEqualNumber(50);
        expect(
          await call(jToken, "accountCollateralTokens", [root])
        ).toEqualNumber(50);
        expect(await call(jToken, "balanceOf", [accounts[0]])).toEqualNumber(
          50
        );
        expect(
          await call(jToken, "accountCollateralTokens", [accounts[0]])
        ).toEqualNumber(50);
      });

      it("transfers non-collateral tokens", async () => {
        const jToken = await makeJToken({
          kind: "jcollateralcap",
          supportMarket: true,
        });
        await send(jToken, "harnessSetBalance", [root, 100]);
        await send(jToken, "harnessSetCollateralBalance", [root, 50]);
        await send(jToken, "harnessSetTotalSupply", [100]);
        await send(jToken, "harnessSetTotalCollateralTokens", [50]);

        expect(await call(jToken, "balanceOf", [root])).toEqualNumber(100);
        expect(
          await call(jToken, "accountCollateralTokens", [root])
        ).toEqualNumber(50);
        await send(jToken, "transfer", [accounts[0], 50]);
        expect(await call(jToken, "balanceOf", [root])).toEqualNumber(50);
        expect(
          await call(jToken, "accountCollateralTokens", [root])
        ).toEqualNumber(50);
        expect(await call(jToken, "balanceOf", [accounts[0]])).toEqualNumber(
          50
        );
        expect(
          await call(jToken, "accountCollateralTokens", [accounts[0]])
        ).toEqualNumber(0);
      });

      it("transfers partial collateral tokens", async () => {
        const jToken = await makeJToken({
          kind: "jcollateralcap",
          supportMarket: true,
        });
        await send(jToken, "harnessSetBalance", [root, 100]);
        await send(jToken, "harnessSetCollateralBalance", [root, 80]);
        await send(jToken, "harnessSetTotalSupply", [100]);
        await send(jToken, "harnessSetTotalCollateralTokens", [80]);

        expect(await call(jToken, "balanceOf", [root])).toEqualNumber(100);
        expect(
          await call(jToken, "accountCollateralTokens", [root])
        ).toEqualNumber(80);
        await send(jToken, "transfer", [accounts[0], 50]);
        expect(await call(jToken, "balanceOf", [root])).toEqualNumber(50);
        expect(
          await call(jToken, "accountCollateralTokens", [root])
        ).toEqualNumber(50);
        expect(await call(jToken, "balanceOf", [accounts[0]])).toEqualNumber(
          50
        );
        expect(
          await call(jToken, "accountCollateralTokens", [accounts[0]])
        ).toEqualNumber(30);
      });
    });
  });
});
