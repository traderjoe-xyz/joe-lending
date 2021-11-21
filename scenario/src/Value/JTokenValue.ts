import { Event } from "../Event";
import { World } from "../World";
import { JToken } from "../Contract/JToken";
import { JErc20Delegator } from "../Contract/JErc20Delegator";
import { Erc20 } from "../Contract/Erc20";
import { getAddressV, getCoreValue, getStringV, mapValue } from "../CoreValue";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { AddressV, NumberV, Value, StringV } from "../Value";
import { getWorldContractByAddress, getJTokenAddress } from "../ContractLookup";

export async function getJTokenV(world: World, event: Event): Promise<JToken> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getJTokenAddress(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<JToken>(world, address.val);
}

export async function getJErc20DelegatorV(
  world: World,
  event: Event
): Promise<JErc20Delegator> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getJTokenAddress(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<JErc20Delegator>(world, address.val);
}

async function getInterestRateModel(
  world: World,
  jToken: JToken
): Promise<AddressV> {
  return new AddressV(await jToken.methods.interestRateModel().call());
}

async function jTokenAddress(world: World, jToken: JToken): Promise<AddressV> {
  return new AddressV(jToken._address);
}

async function getJTokenAdmin(world: World, jToken: JToken): Promise<AddressV> {
  return new AddressV(await jToken.methods.admin().call());
}

async function getJTokenPendingAdmin(
  world: World,
  jToken: JToken
): Promise<AddressV> {
  return new AddressV(await jToken.methods.pendingAdmin().call());
}

async function balanceOfUnderlying(
  world: World,
  jToken: JToken,
  user: string
): Promise<NumberV> {
  return new NumberV(await jToken.methods.balanceOfUnderlying(user).call());
}

async function getBorrowBalance(
  world: World,
  jToken: JToken,
  user
): Promise<NumberV> {
  return new NumberV(await jToken.methods.borrowBalanceCurrent(user).call());
}

async function getBorrowBalanceStored(
  world: World,
  jToken: JToken,
  user
): Promise<NumberV> {
  return new NumberV(await jToken.methods.borrowBalanceStored(user).call());
}

async function getTotalBorrows(world: World, jToken: JToken): Promise<NumberV> {
  return new NumberV(await jToken.methods.totalBorrows().call());
}

async function getTotalBorrowsCurrent(
  world: World,
  jToken: JToken
): Promise<NumberV> {
  return new NumberV(await jToken.methods.totalBorrowsCurrent().call());
}

async function getReserveFactor(
  world: World,
  jToken: JToken
): Promise<NumberV> {
  return new NumberV(
    await jToken.methods.reserveFactorMantissa().call(),
    1.0e18
  );
}

async function getTotalReserves(
  world: World,
  jToken: JToken
): Promise<NumberV> {
  return new NumberV(await jToken.methods.totalReserves().call());
}

async function getJoetroller(world: World, jToken: JToken): Promise<AddressV> {
  return new AddressV(await jToken.methods.joetroller().call());
}

async function getExchangeRateStored(
  world: World,
  jToken: JToken
): Promise<NumberV> {
  return new NumberV(await jToken.methods.exchangeRateStored().call());
}

async function getExchangeRate(world: World, jToken: JToken): Promise<NumberV> {
  return new NumberV(await jToken.methods.exchangeRateCurrent().call(), 1e18);
}

async function getCash(world: World, jToken: JToken): Promise<NumberV> {
  return new NumberV(await jToken.methods.getCash().call());
}

async function getInterestRate(world: World, jToken: JToken): Promise<NumberV> {
  return new NumberV(
    await jToken.methods.borrowRatePerSecond().call(),
    1.0e18 / 31536000
  );
}

async function getImplementation(
  world: World,
  jToken: JToken
): Promise<AddressV> {
  return new AddressV(
    await (jToken as JErc20Delegator).methods.implementation().call()
  );
}

async function getAccountCollateralToken(
  world: World,
  jToken: JToken,
  user: string
): Promise<NumberV> {
  return new NumberV(await jToken.methods.accountCollateralTokens(user).call());
}

async function getTotalCollateralTokens(
  world: World,
  jToken: JToken
): Promise<NumberV> {
  return new NumberV(await jToken.methods.totalCollateralTokens().call());
}

export function jTokenFetchers() {
  return [
    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### Address

        * "JToken <JToken> Address" - Returns address of JToken contract
          * E.g. "JToken cZRX Address" - Returns cZRX's address
      `,
      "Address",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => jTokenAddress(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### InterestRateModel

        * "JToken <JToken> InterestRateModel" - Returns the interest rate model of JToken contract
          * E.g. "JToken cZRX InterestRateModel" - Returns cZRX's interest rate model
      `,
      "InterestRateModel",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getInterestRateModel(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### Admin

        * "JToken <JToken> Admin" - Returns the admin of JToken contract
          * E.g. "JToken cZRX Admin" - Returns cZRX's admin
      `,
      "Admin",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getJTokenAdmin(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### PendingAdmin

        * "JToken <JToken> PendingAdmin" - Returns the pending admin of JToken contract
          * E.g. "JToken cZRX PendingAdmin" - Returns cZRX's pending admin
      `,
      "PendingAdmin",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getJTokenPendingAdmin(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### Underlying

        * "JToken <JToken> Underlying" - Returns the underlying asset (if applicable)
          * E.g. "JToken cZRX Underlying"
      `,
      "Underlying",
      [new Arg("jToken", getJTokenV)],
      async (world, { jToken }) =>
        new AddressV(await jToken.methods.underlying().call()),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken; address: AddressV }, NumberV>(
      `
        #### UnderlyingBalance

        * "JToken <JToken> UnderlyingBalance <User>" - Returns a user's underlying balance (based on given exchange rate)
          * E.g. "JToken cZRX UnderlyingBalance Geoff"
      `,
      "UnderlyingBalance",
      [
        new Arg("jToken", getJTokenV),
        new Arg<AddressV>("address", getAddressV),
      ],
      (world, { jToken, address }) =>
        balanceOfUnderlying(world, jToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken; address: AddressV }, NumberV>(
      `
        #### BorrowBalance

        * "JToken <JToken> BorrowBalance <User>" - Returns a user's borrow balance (including interest)
          * E.g. "JToken cZRX BorrowBalance Geoff"
      `,
      "BorrowBalance",
      [new Arg("jToken", getJTokenV), new Arg("address", getAddressV)],
      (world, { jToken, address }) =>
        getBorrowBalance(world, jToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken; address: AddressV }, NumberV>(
      `
        #### BorrowBalanceStored

        * "JToken <JToken> BorrowBalanceStored <User>" - Returns a user's borrow balance (without specifically re-accruing interest)
          * E.g. "JToken cZRX BorrowBalanceStored Geoff"
      `,
      "BorrowBalanceStored",
      [new Arg("jToken", getJTokenV), new Arg("address", getAddressV)],
      (world, { jToken, address }) =>
        getBorrowBalanceStored(world, jToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### TotalBorrows

        * "JToken <JToken> TotalBorrows" - Returns the jToken's total borrow balance
          * E.g. "JToken cZRX TotalBorrows"
      `,
      "TotalBorrows",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getTotalBorrows(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### TotalBorrowsCurrent

        * "JToken <JToken> TotalBorrowsCurrent" - Returns the jToken's total borrow balance with interest
          * E.g. "JToken cZRX TotalBorrowsCurrent"
      `,
      "TotalBorrowsCurrent",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getTotalBorrowsCurrent(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### Reserves

        * "JToken <JToken> Reserves" - Returns the jToken's total reserves
          * E.g. "JToken cZRX Reserves"
      `,
      "Reserves",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getTotalReserves(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### ReserveFactor

        * "JToken <JToken> ReserveFactor" - Returns reserve factor of JToken contract
          * E.g. "JToken cZRX ReserveFactor" - Returns cZRX's reserve factor
      `,
      "ReserveFactor",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getReserveFactor(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### Joetroller

        * "JToken <JToken> Joetroller" - Returns the jToken's joetroller
          * E.g. "JToken cZRX Joetroller"
      `,
      "Joetroller",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getJoetroller(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### ExchangeRateStored

        * "JToken <JToken> ExchangeRateStored" - Returns the jToken's exchange rate (based on balances stored)
          * E.g. "JToken cZRX ExchangeRateStored"
      `,
      "ExchangeRateStored",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getExchangeRateStored(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### ExchangeRate

        * "JToken <JToken> ExchangeRate" - Returns the jToken's current exchange rate
          * E.g. "JToken cZRX ExchangeRate"
      `,
      "ExchangeRate",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getExchangeRate(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### Cash

        * "JToken <JToken> Cash" - Returns the jToken's current cash
          * E.g. "JToken cZRX Cash"
      `,
      "Cash",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getCash(world, jToken),
      { namePos: 1 }
    ),

    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### InterestRate

        * "JToken <JToken> InterestRate" - Returns the jToken's current interest rate
          * E.g. "JToken cZRX InterestRate"
      `,
      "InterestRate",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getInterestRate(world, jToken),
      { namePos: 1 }
    ),
    new Fetcher<{ jToken: JToken; signature: StringV }, NumberV>(
      `
        #### CallNum

        * "JToken <JToken> Call <signature>" - Simple direct call method, for now with no parameters
          * E.g. "JToken cZRX Call \"borrowIndex()\""
      `,
      "CallNum",
      [new Arg("jToken", getJTokenV), new Arg("signature", getStringV)],
      async (world, { jToken, signature }) => {
        const res = await world.web3.eth.call({
          to: jToken._address,
          data: world.web3.eth.abi.encodeFunctionSignature(signature.val),
        });
        const resNum: any = world.web3.eth.abi.decodeParameter("uint256", res);
        return new NumberV(resNum);
      },
      { namePos: 1 }
    ),
    new Fetcher<{ jToken: JToken }, AddressV>(
      `
        #### Implementation

        * "JToken <JToken> Implementation" - Returns the jToken's current implementation
          * E.g. "JToken cDAI Implementation"
      `,
      "Implementation",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getImplementation(world, jToken),
      { namePos: 1 }
    ),
    new Fetcher<{ jToken: JToken; address: AddressV }, NumberV>(
      `
        #### CollateralBalance

        * "JToken <JToken> CollateralBalance <User>" - Returns the user's collateral tokens
          * E.g. "JToken cDAI CollateralBalance Geoff"
      `,
      "CollateralBalance",
      [new Arg("jToken", getJTokenV), new Arg("address", getAddressV)],
      (world, { jToken, address }) =>
        getAccountCollateralToken(world, jToken, address.val),
      { namePos: 1 }
    ),
    new Fetcher<{ jToken: JToken }, NumberV>(
      `
        #### TotalCollateralTokens

        * "JToken <JToken> TotalCollateralTokens" - Returns the total collateral tokens
          * E.g. "JToken cDAI TotalCollateralTokens"
      `,
      "TotalCollateralTokens",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => getTotalCollateralTokens(world, jToken),
      { namePos: 1 }
    ),
  ];
}

export async function getJTokenValue(
  world: World,
  event: Event
): Promise<Value> {
  return await getFetcherValue<any, any>(
    "jToken",
    jTokenFetchers(),
    world,
    event
  );
}
