import { Event } from "../Event";
import { World } from "../World";
import { Joetroller } from "../Contract/Joetroller";
import { JToken } from "../Contract/JToken";
import {
  getAddressV,
  getCoreValue,
  getStringV,
  getNumberV,
} from "../CoreValue";
import { AddressV, BoolV, ListV, NumberV, StringV, Value } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getJoetroller } from "../ContractLookup";
import { encodedNumber } from "../Encoding";
import { getJTokenV } from "../Value/JTokenValue";
import { encodeABI } from "../Utils";

export async function getJoetrollerAddress(
  world: World,
  joetroller: Joetroller
): Promise<AddressV> {
  return new AddressV(joetroller._address);
}

export async function getLiquidity(
  world: World,
  joetroller: Joetroller,
  user: string
): Promise<NumberV> {
  let {
    0: error,
    1: liquidity,
    2: shortfall,
  } = await joetroller.methods.getAccountLiquidity(user).call();
  if (Number(error) != 0) {
    throw new Error(
      `Failed to joeute account liquidity: error code = ${error}`
    );
  }
  return new NumberV(Number(liquidity) - Number(shortfall));
}

export async function getHypotheticalLiquidity(
  world: World,
  joetroller: Joetroller,
  account: string,
  asset: string,
  redeemTokens: encodedNumber,
  borrowAmount: encodedNumber
): Promise<NumberV> {
  let {
    0: error,
    1: liquidity,
    2: shortfall,
  } = await joetroller.methods
    .getHypotheticalAccountLiquidity(account, asset, redeemTokens, borrowAmount)
    .call();
  if (Number(error) != 0) {
    throw new Error(
      `Failed to joeute account hypothetical liquidity: error code = ${error}`
    );
  }
  return new NumberV(Number(liquidity) - Number(shortfall));
}

async function getPriceOracle(
  world: World,
  joetroller: Joetroller
): Promise<AddressV> {
  return new AddressV(await joetroller.methods.oracle().call());
}

async function getCloseFactor(
  world: World,
  joetroller: Joetroller
): Promise<NumberV> {
  return new NumberV(
    await joetroller.methods.closeFactorMantissa().call(),
    1e18
  );
}

async function getLiquidationIncentive(
  world: World,
  joetroller: Joetroller
): Promise<NumberV> {
  return new NumberV(
    await joetroller.methods.liquidationIncentiveMantissa().call(),
    1e18
  );
}

async function getImplementation(
  world: World,
  joetroller: Joetroller
): Promise<AddressV> {
  return new AddressV(
    await joetroller.methods.joetrollerImplementation().call()
  );
}

async function getBlockTimestamp(
  world: World,
  joetroller: Joetroller
): Promise<NumberV> {
  return new NumberV(await joetroller.methods.getBlockTimestamp().call());
}

async function getAdmin(
  world: World,
  joetroller: Joetroller
): Promise<AddressV> {
  return new AddressV(await joetroller.methods.admin().call());
}

async function getPendingAdmin(
  world: World,
  joetroller: Joetroller
): Promise<AddressV> {
  return new AddressV(await joetroller.methods.pendingAdmin().call());
}

async function getCollateralFactor(
  world: World,
  joetroller: Joetroller,
  jToken: JToken
): Promise<NumberV> {
  let { 0: _isListed, 1: collateralFactorMantissa } = await joetroller.methods
    .markets(jToken._address)
    .call();
  return new NumberV(collateralFactorMantissa, 1e18);
}

async function membershipLength(
  world: World,
  joetroller: Joetroller,
  user: string
): Promise<NumberV> {
  return new NumberV(await joetroller.methods.membershipLength(user).call());
}

async function checkMembership(
  world: World,
  joetroller: Joetroller,
  user: string,
  jToken: JToken
): Promise<BoolV> {
  return new BoolV(
    await joetroller.methods.checkMembership(user, jToken._address).call()
  );
}

async function getAssetsIn(
  world: World,
  joetroller: Joetroller,
  user: string
): Promise<ListV> {
  let assetsList = await joetroller.methods.getAssetsIn(user).call();

  return new ListV(assetsList.map((a) => new AddressV(a)));
}

async function checkListed(
  world: World,
  joetroller: Joetroller,
  jToken: JToken
): Promise<BoolV> {
  let { 0: isListed, 1: _collateralFactorMantissa } = await joetroller.methods
    .markets(jToken._address)
    .call();

  return new BoolV(isListed);
}

async function checkJTokenVersion(
  world: World,
  joetroller: Joetroller,
  jToken: JToken
): Promise<NumberV> {
  let {
    0: isListed,
    1: _collateralFactorMantissa,
    2: version,
  } = await joetroller.methods.markets(jToken._address).call();
  return new NumberV(version);
}

export function joetrollerFetchers() {
  return [
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### Address

        * "Joetroller Address" - Returns address of joetroller
      `,
      "Address",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getJoetrollerAddress(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller; account: AddressV }, NumberV>(
      `
        #### Liquidity

        * "Joetroller Liquidity <User>" - Returns a given user's trued up liquidity
          * E.g. "Joetroller Liquidity Geoff"
      `,
      "Liquidity",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, { joetroller, account }) =>
        getLiquidity(world, joetroller, account.val)
    ),
    new Fetcher<
      {
        joetroller: Joetroller;
        account: AddressV;
        action: StringV;
        amount: NumberV;
        jToken: JToken;
      },
      NumberV
    >(
      `
        #### Hypothetical

        * "Joetroller Hypothetical <User> <Action> <Asset> <Number>" - Returns a given user's trued up liquidity given a hypothetical change in asset with redeeming a certain number of tokens and/or borrowing a given amount.
          * E.g. "Joetroller Hypothetical Geoff Redeems 6.0 cZRX"
          * E.g. "Joetroller Hypothetical Geoff Borrows 5.0 cZRX"
      `,
      "Hypothetical",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("account", getAddressV),
        new Arg("action", getStringV),
        new Arg("amount", getNumberV),
        new Arg("jToken", getJTokenV),
      ],
      async (world, { joetroller, account, action, jToken, amount }) => {
        let redeemTokens: NumberV;
        let borrowAmount: NumberV;

        switch (action.val.toLowerCase()) {
          case "borrows":
            redeemTokens = new NumberV(0);
            borrowAmount = amount;
            break;
          case "redeems":
            redeemTokens = amount;
            borrowAmount = new NumberV(0);
            break;
          default:
            throw new Error(`Unknown hypothetical: ${action.val}`);
        }

        return await getHypotheticalLiquidity(
          world,
          joetroller,
          account.val,
          jToken._address,
          redeemTokens.encode(),
          borrowAmount.encode()
        );
      }
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### Admin

        * "Joetroller Admin" - Returns the Joetrollers's admin
          * E.g. "Joetroller Admin"
      `,
      "Admin",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getAdmin(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### PendingAdmin

        * "Joetroller PendingAdmin" - Returns the pending admin of the Joetroller
          * E.g. "Joetroller PendingAdmin" - Returns Joetroller's pending admin
      `,
      "PendingAdmin",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getPendingAdmin(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### PriceOracle

        * "Joetroller PriceOracle" - Returns the Joetrollers's price oracle
          * E.g. "Joetroller PriceOracle"
      `,
      "PriceOracle",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getPriceOracle(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller }, NumberV>(
      `
        #### CloseFactor

        * "Joetroller CloseFactor" - Returns the Joetrollers's price oracle
          * E.g. "Joetroller CloseFactor"
      `,
      "CloseFactor",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getCloseFactor(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller }, NumberV>(
      `
        #### LiquidationIncentive

        * "Joetroller LiquidationIncentive" - Returns the Joetrollers's liquidation incentive
          * E.g. "Joetroller LiquidationIncentive"
      `,
      "LiquidationIncentive",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getLiquidationIncentive(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### Implementation

        * "Joetroller Implementation" - Returns the Joetrollers's implementation
          * E.g. "Joetroller Implementation"
      `,
      "Implementation",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getImplementation(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller }, NumberV>(
      `
        #### BlockTimestamp

        * "Joetroller BlockTimestamp" - Returns the Joetrollers's mocked block timestamp (for scenario runner)
          * E.g. "Joetroller BlockTimestamp"
      `,
      "BlockTimestamp",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => getBlockTimestamp(world, joetroller)
    ),
    new Fetcher<{ joetroller: Joetroller; jToken: JToken }, NumberV>(
      `
        #### CollateralFactor

        * "Joetroller CollateralFactor <JToken>" - Returns the collateralFactor associated with a given asset
          * E.g. "Joetroller CollateralFactor cZRX"
      `,
      "CollateralFactor",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      (world, { joetroller, jToken }) =>
        getCollateralFactor(world, joetroller, jToken)
    ),
    new Fetcher<{ joetroller: Joetroller; account: AddressV }, NumberV>(
      `
        #### MembershipLength

        * "Joetroller MembershipLength <User>" - Returns a given user's length of membership
          * E.g. "Joetroller MembershipLength Geoff"
      `,
      "MembershipLength",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, { joetroller, account }) =>
        membershipLength(world, joetroller, account.val)
    ),
    new Fetcher<
      { joetroller: Joetroller; account: AddressV; jToken: JToken },
      BoolV
    >(
      `
        #### CheckMembership

        * "Joetroller CheckMembership <User> <JToken>" - Returns one if user is in asset, zero otherwise.
          * E.g. "Joetroller CheckMembership Geoff cZRX"
      `,
      "CheckMembership",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("account", getAddressV),
        new Arg("jToken", getJTokenV),
      ],
      (world, { joetroller, account, jToken }) =>
        checkMembership(world, joetroller, account.val, jToken)
    ),
    new Fetcher<{ joetroller: Joetroller; account: AddressV }, ListV>(
      `
        #### AssetsIn

        * "Joetroller AssetsIn <User>" - Returns the assets a user is in
          * E.g. "Joetroller AssetsIn Geoff"
      `,
      "AssetsIn",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, { joetroller, account }) =>
        getAssetsIn(world, joetroller, account.val)
    ),
    new Fetcher<{ joetroller: Joetroller; jToken: JToken }, BoolV>(
      `
        #### CheckListed

        * "Joetroller CheckListed <JToken>" - Returns true if market is listed, false otherwise.
          * E.g. "Joetroller CheckListed cZRX"
      `,
      "CheckListed",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      (world, { joetroller, jToken }) => checkListed(world, joetroller, jToken)
    ),
    new Fetcher<{ joetroller: Joetroller; jToken: JToken }, NumberV>(
      `
        #### CheckJTokenVersion

        * "Joetroller CheckJTokenVersion <JToken>" - Returns the version of given JToken.
          * E.g. "Joetroller CheckJTokenVersion cZRX"
      `,
      "CheckJTokenVersion",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      (world, { joetroller, jToken }) =>
        checkJTokenVersion(world, joetroller, jToken)
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### PauseGuardian

        * "PauseGuardian" - Returns the Joetrollers's PauseGuardian
        * E.g. "Joetroller PauseGuardian"
        `,
      "PauseGuardian",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new AddressV(await joetroller.methods.pauseGuardian().call())
    ),

    new Fetcher<{ joetroller: Joetroller }, BoolV>(
      `
        #### _MintGuardianPaused

        * "_MintGuardianPaused" - Returns the Joetrollers's original global Mint paused status
        * E.g. "Joetroller _MintGuardianPaused"
        `,
      "_MintGuardianPaused",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new BoolV(await joetroller.methods._mintGuardianPaused().call())
    ),
    new Fetcher<{ joetroller: Joetroller }, BoolV>(
      `
        #### _BorrowGuardianPaused

        * "_BorrowGuardianPaused" - Returns the Joetrollers's original global Borrow paused status
        * E.g. "Joetroller _BorrowGuardianPaused"
        `,
      "_BorrowGuardianPaused",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new BoolV(await joetroller.methods._borrowGuardianPaused().call())
    ),

    new Fetcher<{ joetroller: Joetroller }, BoolV>(
      `
        #### TransferGuardianPaused

        * "TransferGuardianPaused" - Returns the Joetrollers's Transfer paused status
        * E.g. "Joetroller TransferGuardianPaused"
        `,
      "TransferGuardianPaused",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new BoolV(await joetroller.methods.transferGuardianPaused().call())
    ),
    new Fetcher<{ joetroller: Joetroller }, BoolV>(
      `
        #### SeizeGuardianPaused

        * "SeizeGuardianPaused" - Returns the Joetrollers's Seize paused status
        * E.g. "Joetroller SeizeGuardianPaused"
        `,
      "SeizeGuardianPaused",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new BoolV(await joetroller.methods.seizeGuardianPaused().call())
    ),

    new Fetcher<{ joetroller: Joetroller; jToken: JToken }, BoolV>(
      `
        #### MintGuardianMarketPaused

        * "MintGuardianMarketPaused" - Returns the Joetrollers's Mint paused status in market
        * E.g. "Joetroller MintGuardianMarketPaused cREP"
        `,
      "MintGuardianMarketPaused",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      async (world, { joetroller, jToken }) =>
        new BoolV(
          await joetroller.methods.mintGuardianPaused(jToken._address).call()
        )
    ),
    new Fetcher<{ joetroller: Joetroller; jToken: JToken }, BoolV>(
      `
        #### BorrowGuardianMarketPaused

        * "BorrowGuardianMarketPaused" - Returns the Joetrollers's Borrow paused status in market
        * E.g. "Joetroller BorrowGuardianMarketPaused cREP"
        `,
      "BorrowGuardianMarketPaused",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      async (world, { joetroller, jToken }) =>
        new BoolV(
          await joetroller.methods.borrowGuardianPaused(jToken._address).call()
        )
    ),
    new Fetcher<
      { joetroller: Joetroller; signature: StringV; callArgs: StringV[] },
      NumberV
    >(
      `
        #### CallNum

        * "CallNum signature:<String> ...callArgs<CoreValue>" - Simple direct call method
          * E.g. "Joetroller CallNum \"joeSpeeds(address)\" (Address Coburn)"
      `,
      "CallNum",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("signature", getStringV),
        new Arg("callArgs", getCoreValue, { variadic: true, mapped: true }),
      ],
      async (world, { joetroller, signature, callArgs }) => {
        const fnData = encodeABI(
          world,
          signature.val,
          callArgs.map((a) => a.val)
        );
        const res = await world.web3.eth.call({
          to: joetroller._address,
          data: fnData,
        });
        const resNum: any = world.web3.eth.abi.decodeParameter("uint256", res);
        return new NumberV(resNum);
      }
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### SupplyCapGuardian

        * "SupplyCapGuardian" - Returns the Joetrollers's SupplyCapGuardian
        * E.g. "Joetroller SupplyCapGuardian"
        `,
      "SupplyCapGuardian",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new AddressV(await joetroller.methods.supplyCapGuardian().call())
    ),
    new Fetcher<{ joetroller: Joetroller; JToken: JToken }, NumberV>(
      `
        #### SupplyCaps

        * "Joetroller SupplyCaps cZRX
      `,
      "SupplyCaps",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("JToken", getJTokenV),
      ],
      async (world, { joetroller, JToken }) => {
        return new NumberV(
          await joetroller.methods.supplyCaps(JToken._address).call()
        );
      }
    ),
    new Fetcher<{ joetroller: Joetroller }, AddressV>(
      `
        #### BorrowCapGuardian

        * "BorrowCapGuardian" - Returns the Joetrollers's BorrowCapGuardian
        * E.g. "Joetroller BorrowCapGuardian"
        `,
      "BorrowCapGuardian",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      async (world, { joetroller }) =>
        new AddressV(await joetroller.methods.borrowCapGuardian().call())
    ),
    new Fetcher<{ joetroller: Joetroller; JToken: JToken }, NumberV>(
      `
        #### BorrowCaps

        * "Joetroller BorrowCaps cZRX
      `,
      "BorrowCaps",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("JToken", getJTokenV),
      ],
      async (world, { joetroller, JToken }) => {
        return new NumberV(
          await joetroller.methods.borrowCaps(JToken._address).call()
        );
      }
    ),
  ];
}

export async function getJoetrollerValue(
  world: World,
  event: Event
): Promise<Value> {
  return await getFetcherValue<any, any>(
    "Joetroller",
    joetrollerFetchers(),
    world,
    event
  );
}
