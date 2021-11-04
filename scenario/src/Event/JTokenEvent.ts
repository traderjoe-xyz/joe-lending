import { Event } from "../Event";
import { addAction, describeUser, World } from "../World";
import { decodeCall, getPastEvents } from "../Contract";
import { JToken, JTokenScenario } from "../Contract/JToken";
import { JErc20Delegate } from "../Contract/JErc20Delegate";
import { JErc20Delegator } from "../Contract/JErc20Delegator";
import { invoke, Sendable } from "../Invokation";
import {
  getAddressV,
  getEventV,
  getExpNumberV,
  getNumberV,
  getStringV,
  getBoolV,
} from "../CoreValue";
import { AddressV, BoolV, EventV, NothingV, NumberV, StringV } from "../Value";
import { getContract } from "../Contract";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { JTokenErrorReporter } from "../ErrorReporter";
import { getJoetroller, getJTokenData } from "../ContractLookup";
import { buildJToken } from "../Builder/JTokenBuilder";
import { verify } from "../Verify";
import { getLiquidity } from "../Value/JoetrollerValue";
import { getJTokenV, getJErc20DelegatorV } from "../Value/JTokenValue";

function showTrxValue(world: World): string {
  return new NumberV(world.trxInvokationOpts.get("value")).show();
}

async function genJToken(
  world: World,
  from: string,
  event: Event
): Promise<World> {
  let {
    world: nextWorld,
    jToken,
    tokenData,
  } = await buildJToken(world, from, event);
  world = nextWorld;

  world = addAction(
    world,
    `Added jToken ${tokenData.name} (${tokenData.contract}<decimals=${tokenData.decimals}>) at address ${jToken._address}`,
    tokenData.invokation
  );

  return world;
}

async function accrueInterest(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.accrueInterest(),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: Interest accrued`,
    invokation
  );

  return world;
}

async function mint(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV | NothingV
): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberV) {
    showAmount = amount.show();
    invokation = await invoke(
      world,
      jToken.methods.mint(amount.encode()),
      from,
      JTokenErrorReporter
    );
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(
      world,
      jToken.methods.mint(),
      from,
      JTokenErrorReporter
    );
  }

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(world, from)} mints ${showAmount}`,
    invokation
  );

  return world;
}

async function mintNative(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  const showAmount = showTrxValue(world);
  let invokation = await invoke(
    world,
    jToken.methods.mintNative(),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(world, from)} mints ${showAmount}`,
    invokation
  );

  return world;
}

async function redeem(
  world: World,
  from: string,
  jToken: JToken,
  tokens: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.redeem(tokens.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} redeems ${tokens.show()} tokens`,
    invokation
  );

  return world;
}

async function redeemNative(
  world: World,
  from: string,
  jToken: JToken,
  tokens: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.redeemNative(tokens.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} redeems ${tokens.show()} tokens`,
    invokation
  );

  return world;
}

async function redeemUnderlying(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.redeemUnderlying(amount.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} redeems ${amount.show()} underlying`,
    invokation
  );

  return world;
}

async function redeemUnderlyingNative(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.redeemUnderlyingNative(amount.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} redeems ${amount.show()} underlying`,
    invokation
  );

  return world;
}

async function borrow(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.borrow(amount.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} borrows ${amount.show()}`,
    invokation
  );

  return world;
}

async function borrowNative(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.borrowNative(amount.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} borrows ${amount.show()}`,
    invokation
  );

  return world;
}

async function repayBorrow(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV | NothingV
): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberV) {
    showAmount = amount.show();
    invokation = await invoke(
      world,
      jToken.methods.repayBorrow(amount.encode()),
      from,
      JTokenErrorReporter
    );
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(
      world,
      jToken.methods.repayBorrow(),
      from,
      JTokenErrorReporter
    );
  }

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} repays ${showAmount} of borrow`,
    invokation
  );

  return world;
}

async function repayBorrowNative(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  const showAmount = showTrxValue(world);
  let invokation = await invoke(
    world,
    jToken.methods.repayBorrowNative(),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} repays ${showAmount} of borrow`,
    invokation
  );

  return world;
}

async function liquidateBorrow(
  world: World,
  from: string,
  jToken: JToken,
  borrower: string,
  collateral: JToken,
  repayAmount: NumberV | NothingV
): Promise<World> {
  let invokation;
  let showAmount;

  if (repayAmount instanceof NumberV) {
    showAmount = repayAmount.show();
    invokation = await invoke(
      world,
      jToken.methods.liquidateBorrow(
        borrower,
        repayAmount.encode(),
        collateral._address
      ),
      from,
      JTokenErrorReporter
    );
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(
      world,
      jToken.methods.liquidateBorrow(borrower, collateral._address),
      from,
      JTokenErrorReporter
    );
  }

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} liquidates ${showAmount} from of ${describeUser(
      world,
      borrower
    )}, seizing ${collateral.name}.`,
    invokation
  );

  return world;
}

async function seize(
  world: World,
  from: string,
  jToken: JToken,
  liquidator: string,
  borrower: string,
  seizeTokens: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.seize(liquidator, borrower, seizeTokens.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} initiates seizing ${seizeTokens.show()} to ${describeUser(
      world,
      liquidator
    )} from ${describeUser(world, borrower)}.`,
    invokation
  );

  return world;
}

async function evilSeize(
  world: World,
  from: string,
  jToken: JToken,
  treasure: JToken,
  liquidator: string,
  borrower: string,
  seizeTokens: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.evilSeize(
      treasure._address,
      liquidator,
      borrower,
      seizeTokens.encode()
    ),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} initiates illegal seizing ${seizeTokens.show()} to ${describeUser(
      world,
      liquidator
    )} from ${describeUser(world, borrower)}.`,
    invokation
  );

  return world;
}

async function setPendingAdmin(
  world: World,
  from: string,
  jToken: JToken,
  newPendingAdmin: string
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._setPendingAdmin(newPendingAdmin),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} sets pending admin to ${newPendingAdmin}`,
    invokation
  );

  return world;
}

async function acceptAdmin(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._acceptAdmin(),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(world, from)} accepts admin`,
    invokation
  );

  return world;
}

async function addReserves(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._addReserves(amount.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} adds to reserves by ${amount.show()}`,
    invokation
  );

  return world;
}

async function reduceReserves(
  world: World,
  from: string,
  jToken: JToken,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._reduceReserves(amount.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} reduces reserves by ${amount.show()}`,
    invokation
  );

  return world;
}

async function setReserveFactor(
  world: World,
  from: string,
  jToken: JToken,
  reserveFactor: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._setReserveFactor(reserveFactor.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} sets reserve factor to ${reserveFactor.show()}`,
    invokation
  );

  return world;
}

async function setInterestRateModel(
  world: World,
  from: string,
  jToken: JToken,
  interestRateModel: string
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._setInterestRateModel(interestRateModel),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `Set interest rate for ${
      jToken.name
    } to ${interestRateModel} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function setJoetroller(
  world: World,
  from: string,
  jToken: JToken,
  joetroller: string
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._setJoetroller(joetroller),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `Set joetroller for ${jToken.name} to ${joetroller} as ${describeUser(
      world,
      from
    )}`,
    invokation
  );

  return world;
}

async function gulp(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.gulp(),
    from,
    JTokenErrorReporter
  );

  world = addAction(world, `JToken ${jToken.name}: Gulp`, invokation);

  return world;
}

async function setCollateralCap(
  world: World,
  from: string,
  jToken: JToken,
  cap: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._setCollateralCap(cap.encode()),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `Set collateral cap for ${jToken.name} to ${cap.show()}`,
    invokation
  );

  return world;
}

async function becomeImplementation(
  world: World,
  from: string,
  jToken: JToken,
  becomeImplementationData: string
): Promise<World> {
  const cErc20Delegate = getContract("JErc20Delegate");
  const cErc20DelegateContract = await cErc20Delegate.at<JErc20Delegate>(
    world,
    jToken._address
  );

  let invokation = await invoke(
    world,
    cErc20DelegateContract.methods._becomeImplementation(
      becomeImplementationData
    ),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} initiates _becomeImplementation with data:${becomeImplementationData}.`,
    invokation
  );

  return world;
}

async function resignImplementation(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  const cErc20Delegate = getContract("JErc20Delegate");
  const cErc20DelegateContract = await cErc20Delegate.at<JErc20Delegate>(
    world,
    jToken._address
  );

  let invokation = await invoke(
    world,
    cErc20DelegateContract.methods._resignImplementation(),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} initiates _resignImplementation.`,
    invokation
  );

  return world;
}

async function setImplementation(
  world: World,
  from: string,
  jToken: JErc20Delegator,
  implementation: string,
  allowResign: boolean,
  becomeImplementationData: string
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods._setImplementation(
      implementation,
      allowResign,
      becomeImplementationData
    ),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `JToken ${jToken.name}: ${describeUser(
      world,
      from
    )} initiates setImplementation with implementation:${implementation} allowResign:${allowResign} data:${becomeImplementationData}.`,
    invokation
  );

  return world;
}

async function donate(
  world: World,
  from: string,
  jToken: JToken
): Promise<World> {
  let invokation = await invoke(
    world,
    jToken.methods.donate(),
    from,
    JTokenErrorReporter
  );

  world = addAction(
    world,
    `Donate for ${jToken.name} as ${describeUser(
      world,
      from
    )} with value ${showTrxValue(world)}`,
    invokation
  );

  return world;
}

async function setJTokenMock(
  world: World,
  from: string,
  jToken: JTokenScenario,
  mock: string,
  value: NumberV
): Promise<World> {
  let mockMethod: (number) => Sendable<void>;

  switch (mock.toLowerCase()) {
    case "totalborrows":
      mockMethod = jToken.methods.setTotalBorrows;
      break;
    case "totalreserves":
      mockMethod = jToken.methods.setTotalReserves;
      break;
    default:
      throw new Error(`Mock "${mock}" not defined for jToken`);
  }

  let invokation = await invoke(world, mockMethod(value.encode()), from);

  world = addAction(
    world,
    `Mocked ${mock}=${value.show()} for ${jToken.name}`,
    invokation
  );

  return world;
}

async function verifyJToken(
  world: World,
  jToken: JToken,
  name: string,
  contract: string,
  apiKey: string
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(
      `Politely declining to verify on local network: ${world.network}.`
    );
  } else {
    await verify(world, apiKey, name, contract, jToken._address);
  }

  return world;
}

async function printMinters(world: World, jToken: JToken): Promise<World> {
  let events = await getPastEvents(world, jToken, jToken.name, "Mint");
  let addresses = events.map((event) => event.returnValues["minter"]);
  let uniq = [...new Set(addresses)];

  world.printer.printLine("Minters:");

  uniq.forEach((address) => {
    world.printer.printLine(`\t${address}`);
  });

  return world;
}

async function printBorrowers(world: World, jToken: JToken): Promise<World> {
  let events = await getPastEvents(world, jToken, jToken.name, "Borrow");
  let addresses = events.map((event) => event.returnValues["borrower"]);
  let uniq = [...new Set(addresses)];

  world.printer.printLine("Borrowers:");

  uniq.forEach((address) => {
    world.printer.printLine(`\t${address}`);
  });

  return world;
}

async function printLiquidity(world: World, jToken: JToken): Promise<World> {
  let mintEvents = await getPastEvents(world, jToken, jToken.name, "Mint");
  let mintAddresses = mintEvents.map((event) => event.returnValues["minter"]);
  let borrowEvents = await getPastEvents(world, jToken, jToken.name, "Borrow");
  let borrowAddresses = borrowEvents.map(
    (event) => event.returnValues["borrower"]
  );
  let uniq = [...new Set(mintAddresses.concat(borrowAddresses))];
  let joetroller = await getJoetroller(world);

  world.printer.printLine("Liquidity:");

  const liquidityMap = await Promise.all(
    uniq.map(async (address) => {
      let userLiquidity = await getLiquidity(world, joetroller, address);

      return [address, userLiquidity.val];
    })
  );

  liquidityMap.forEach(([address, liquidity]) => {
    world.printer.printLine(
      `\t${world.settings.lookupAlias(address)}: ${liquidity / 1e18}e18`
    );
  });

  return world;
}

export function jTokenCommands() {
  return [
    new Command<{ jTokenParams: EventV }>(
      `
        #### Deploy

        * "JToken Deploy ...jTokenParams" - Generates a new JToken
          * E.g. "JToken cZRX Deploy"
      `,
      "Deploy",
      [new Arg("jTokenParams", getEventV, { variadic: true })],
      (world, from, { jTokenParams }) =>
        genJToken(world, from, jTokenParams.val)
    ),
    new View<{ jTokenArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "JToken <jToken> Verify apiKey:<String>" - Verifies JToken in Etherscan
          * E.g. "JToken cZRX Verify "myApiKey"
      `,
      "Verify",
      [new Arg("jTokenArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { jTokenArg, apiKey }) => {
        let [jToken, name, data] = await getJTokenData(world, jTokenArg.val);

        return await verifyJToken(
          world,
          jToken,
          name,
          data.get("contract")!,
          apiKey.val
        );
      },
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken }>(
      `
        #### AccrueInterest

        * "JToken <jToken> AccrueInterest" - Accrues interest for given token
          * E.g. "JToken cZRX AccrueInterest"
      `,
      "AccrueInterest",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken }) => accrueInterest(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV | NothingV }>(
      `
        #### Mint

        * "JToken <jToken> Mint amount:<Number>" - Mints the given amount of jToken as specified user
          * E.g. "JToken cZRX Mint 1.0e18"
      `,
      "Mint",
      [
        new Arg("jToken", getJTokenV),
        new Arg("amount", getNumberV, { nullable: true }),
      ],
      (world, from, { jToken, amount }) => mint(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken }>(
      `
        #### MintNative

        * "JToken <jToken> MintNative" - Mints the given amount of jToken as specified user
          * E.g. "JToken cWETH MintNative"
      `,
      "MintNative",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken }) => mintNative(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; tokens: NumberV }>(
      `
        #### Redeem

        * "JToken <jToken> Redeem tokens:<Number>" - Redeems the given amount of jTokens as specified user
          * E.g. "JToken cZRX Redeem 1.0e9"
      `,
      "Redeem",
      [new Arg("jToken", getJTokenV), new Arg("tokens", getNumberV)],
      (world, from, { jToken, tokens }) => redeem(world, from, jToken, tokens),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; tokens: NumberV }>(
      `
        #### RedeemNative

        * "JToken <jToken> RedeemNative tokens:<Number>" - Redeems the given amount of jTokens as specified user
          * E.g. "JToken cZRX RedeemNative 1.0e9"
      `,
      "RedeemNative",
      [new Arg("jToken", getJTokenV), new Arg("tokens", getNumberV)],
      (world, from, { jToken, tokens }) =>
        redeemNative(world, from, jToken, tokens),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
        #### RedeemUnderlying

        * "JToken <jToken> RedeemUnderlying amount:<Number>" - Redeems the given amount of underlying as specified user
          * E.g. "JToken cZRX RedeemUnderlying 1.0e18"
      `,
      "RedeemUnderlying",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      (world, from, { jToken, amount }) =>
        redeemUnderlying(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
        #### RedeemUnderlyingNative

        * "JToken <jToken> RedeemUnderlyingNative amount:<Number>" - Redeems the given amount of underlying as specified user
          * E.g. "JToken cZRX RedeemUnderlyingNative 1.0e18"
      `,
      "RedeemUnderlyingNative",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      (world, from, { jToken, amount }) =>
        redeemUnderlyingNative(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
        #### Borrow

        * "JToken <jToken> Borrow amount:<Number>" - Borrows the given amount of this jToken as specified user
          * E.g. "JToken cZRX Borrow 1.0e18"
      `,
      "Borrow",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      // Note: we override from
      (world, from, { jToken, amount }) => borrow(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
        #### BorrowNative

        * "JToken <jToken> BorrowNative amount:<Number>" - Borrows the given amount of this jToken as specified user
          * E.g. "JToken cZRX BorrowNative 1.0e18"
      `,
      "BorrowNative",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      // Note: we override from
      (world, from, { jToken, amount }) =>
        borrowNative(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV | NothingV }>(
      `
        #### RepayBorrow

        * "JToken <jToken> RepayBorrow underlyingAmount:<Number>" - Repays borrow in the given underlying amount as specified user
          * E.g. "JToken cZRX RepayBorrow 1.0e18"
      `,
      "RepayBorrow",
      [
        new Arg("jToken", getJTokenV),
        new Arg("amount", getNumberV, { nullable: true }),
      ],
      (world, from, { jToken, amount }) =>
        repayBorrow(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV | NothingV }>(
      `
        #### RepayBorrowNative

        * "JToken <jToken> RepayBorrowNative" - Repays borrow in the given underlying amount as specified user
          * E.g. "JToken cZRX RepayBorrowNative"
      `,
      "RepayBorrowNative",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken, amount }) =>
        repayBorrowNative(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{
      borrower: AddressV;
      jToken: JToken;
      collateral: JToken;
      repayAmount: NumberV | NothingV;
    }>(
      `
        #### Liquidate

        * "JToken <jToken> Liquidate borrower:<User> jTokenCollateral:<Address> repayAmount:<Number>" - Liquidates repayAmount of given token seizing collateral token
          * E.g. "JToken cZRX Liquidate Geoff cBAT 1.0e18"
      `,
      "Liquidate",
      [
        new Arg("jToken", getJTokenV),
        new Arg("borrower", getAddressV),
        new Arg("collateral", getJTokenV),
        new Arg("repayAmount", getNumberV, { nullable: true }),
      ],
      (world, from, { borrower, jToken, collateral, repayAmount }) =>
        liquidateBorrow(
          world,
          from,
          jToken,
          borrower.val,
          collateral,
          repayAmount
        ),
      { namePos: 1 }
    ),
    new Command<{
      jToken: JToken;
      liquidator: AddressV;
      borrower: AddressV;
      seizeTokens: NumberV;
    }>(
      `
        #### Seize

        * "JToken <jToken> Seize liquidator:<User> borrower:<User> seizeTokens:<Number>" - Seizes a given number of tokens from a user (to be called from other JToken)
          * E.g. "JToken cZRX Seize Geoff Torrey 1.0e18"
      `,
      "Seize",
      [
        new Arg("jToken", getJTokenV),
        new Arg("liquidator", getAddressV),
        new Arg("borrower", getAddressV),
        new Arg("seizeTokens", getNumberV),
      ],
      (world, from, { jToken, liquidator, borrower, seizeTokens }) =>
        seize(world, from, jToken, liquidator.val, borrower.val, seizeTokens),
      { namePos: 1 }
    ),
    new Command<{
      jToken: JToken;
      treasure: JToken;
      liquidator: AddressV;
      borrower: AddressV;
      seizeTokens: NumberV;
    }>(
      `
        #### EvilSeize

        * "JToken <jToken> EvilSeize treasure:<Token> liquidator:<User> borrower:<User> seizeTokens:<Number>" - Improperly seizes a given number of tokens from a user
          * E.g. "JToken cEVL EvilSeize cZRX Geoff Torrey 1.0e18"
      `,
      "EvilSeize",
      [
        new Arg("jToken", getJTokenV),
        new Arg("treasure", getJTokenV),
        new Arg("liquidator", getAddressV),
        new Arg("borrower", getAddressV),
        new Arg("seizeTokens", getNumberV),
      ],
      (world, from, { jToken, treasure, liquidator, borrower, seizeTokens }) =>
        evilSeize(
          world,
          from,
          jToken,
          treasure,
          liquidator.val,
          borrower.val,
          seizeTokens
        ),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
        #### ReduceReserves

        * "JToken <jToken> ReduceReserves amount:<Number>" - Reduces the reserves of the jToken
          * E.g. "JToken cZRX ReduceReserves 1.0e18"
      `,
      "ReduceReserves",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      (world, from, { jToken, amount }) =>
        reduceReserves(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
    #### AddReserves

    * "JToken <jToken> AddReserves amount:<Number>" - Adds reserves to the jToken
      * E.g. "JToken cZRX AddReserves 1.0e18"
  `,
      "AddReserves",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      (world, from, { jToken, amount }) =>
        addReserves(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; newPendingAdmin: AddressV }>(
      `
        #### SetPendingAdmin

        * "JToken <jToken> SetPendingAdmin newPendingAdmin:<Address>" - Sets the pending admin for the jToken
          * E.g. "JToken cZRX SetPendingAdmin Geoff"
      `,
      "SetPendingAdmin",
      [new Arg("jToken", getJTokenV), new Arg("newPendingAdmin", getAddressV)],
      (world, from, { jToken, newPendingAdmin }) =>
        setPendingAdmin(world, from, jToken, newPendingAdmin.val),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken }>(
      `
        #### AcceptAdmin

        * "JToken <jToken> AcceptAdmin" - Accepts admin for the jToken
          * E.g. "From Geoff (JToken cZRX AcceptAdmin)"
      `,
      "AcceptAdmin",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken }) => acceptAdmin(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; reserveFactor: NumberV }>(
      `
        #### SetReserveFactor

        * "JToken <jToken> SetReserveFactor reserveFactor:<Number>" - Sets the reserve factor for the jToken
          * E.g. "JToken cZRX SetReserveFactor 0.1"
      `,
      "SetReserveFactor",
      [new Arg("jToken", getJTokenV), new Arg("reserveFactor", getExpNumberV)],
      (world, from, { jToken, reserveFactor }) =>
        setReserveFactor(world, from, jToken, reserveFactor),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; interestRateModel: AddressV }>(
      `
        #### SetInterestRateModel

        * "JToken <jToken> SetInterestRateModel interestRateModel:<Contract>" - Sets the interest rate model for the given jToken
          * E.g. "JToken cZRX SetInterestRateModel (FixedRate 1.5)"
      `,
      "SetInterestRateModel",
      [
        new Arg("jToken", getJTokenV),
        new Arg("interestRateModel", getAddressV),
      ],
      (world, from, { jToken, interestRateModel }) =>
        setInterestRateModel(world, from, jToken, interestRateModel.val),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; joetroller: AddressV }>(
      `
        #### SetJoetroller

        * "JToken <jToken> SetJoetroller joetroller:<Contract>" - Sets the joetroller for the given jToken
          * E.g. "JToken cZRX SetJoetroller Joetroller"
      `,
      "SetJoetroller",
      [new Arg("jToken", getJTokenV), new Arg("joetroller", getAddressV)],
      (world, from, { jToken, joetroller }) =>
        setJoetroller(world, from, jToken, joetroller.val),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken }>(
      `
        #### Gulp
        * "JToken <jToken> Gulp" - Gulps for the jToken
          * E.g. "JToken cZRX Gulp"
      `,
      "Gulp",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken }) => gulp(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; amount: NumberV }>(
      `
        #### SetCollateralCap
        * "JToken <jToken> SetCollateralCap amount:<Number>" - Sets the collateral cap for the given jToken
          * E.g. "JToken cZRX SetCollateralCap 1e10"
      `,
      "SetCollateralCap",
      [new Arg("jToken", getJTokenV), new Arg("amount", getNumberV)],
      (world, from, { jToken, amount }) =>
        setCollateralCap(world, from, jToken, amount),
      { namePos: 1 }
    ),
    new Command<{
      jToken: JToken;
      becomeImplementationData: StringV;
    }>(
      `
        #### BecomeImplementation

        * "JToken <jToken> BecomeImplementation becomeImplementationData:<String>"
          * E.g. "JToken cDAI BecomeImplementation "0x01234anyByTeS56789""
      `,
      "BecomeImplementation",
      [
        new Arg("jToken", getJTokenV),
        new Arg("becomeImplementationData", getStringV),
      ],
      (world, from, { jToken, becomeImplementationData }) =>
        becomeImplementation(world, from, jToken, becomeImplementationData.val),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken }>(
      `
        #### ResignImplementation

        * "JToken <jToken> ResignImplementation"
          * E.g. "JToken cDAI ResignImplementation"
      `,
      "ResignImplementation",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken }) => resignImplementation(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{
      jToken: JErc20Delegator;
      implementation: AddressV;
      allowResign: BoolV;
      becomeImplementationData: StringV;
    }>(
      `
        #### SetImplementation

        * "JToken <jToken> SetImplementation implementation:<Address> allowResign:<Bool> becomeImplementationData:<String>"
          * E.g. "JToken cDAI SetImplementation (JToken cDAIDelegate Address) True "0x01234anyByTeS56789"
      `,
      "SetImplementation",
      [
        new Arg("jToken", getJErc20DelegatorV),
        new Arg("implementation", getAddressV),
        new Arg("allowResign", getBoolV),
        new Arg("becomeImplementationData", getStringV),
      ],
      (
        world,
        from,
        { jToken, implementation, allowResign, becomeImplementationData }
      ) =>
        setImplementation(
          world,
          from,
          jToken,
          implementation.val,
          allowResign.val,
          becomeImplementationData.val
        ),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken }>(
      `
        #### Donate

        * "JToken <jToken> Donate" - Calls the donate (payable no-op) function
          * E.g. "(Trx Value 5.0e18 (JToken cETH Donate))"
      `,
      "Donate",
      [new Arg("jToken", getJTokenV)],
      (world, from, { jToken }) => donate(world, from, jToken),
      { namePos: 1 }
    ),
    new Command<{ jToken: JToken; variable: StringV; value: NumberV }>(
      `
        #### Mock

        * "JToken <jToken> Mock variable:<String> value:<Number>" - Mocks a given value on jToken. Note: value must be a supported mock and this will only work on a "JTokenScenario" contract.
          * E.g. "JToken cZRX Mock totalBorrows 5.0e18"
          * E.g. "JToken cZRX Mock totalReserves 0.5e18"
      `,
      "Mock",
      [
        new Arg("jToken", getJTokenV),
        new Arg("variable", getStringV),
        new Arg("value", getNumberV),
      ],
      (world, from, { jToken, variable, value }) =>
        setJTokenMock(world, from, <JTokenScenario>jToken, variable.val, value),
      { namePos: 1 }
    ),
    new View<{ jToken: JToken }>(
      `
        #### Minters

        * "JToken <jToken> Minters" - Print address of all minters
      `,
      "Minters",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => printMinters(world, jToken),
      { namePos: 1 }
    ),
    new View<{ jToken: JToken }>(
      `
        #### Borrowers

        * "JToken <jToken> Borrowers" - Print address of all borrowers
      `,
      "Borrowers",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => printBorrowers(world, jToken),
      { namePos: 1 }
    ),
    new View<{ jToken: JToken }>(
      `
        #### Liquidity

        * "JToken <jToken> Liquidity" - Prints liquidity of all minters or borrowers
      `,
      "Liquidity",
      [new Arg("jToken", getJTokenV)],
      (world, { jToken }) => printLiquidity(world, jToken),
      { namePos: 1 }
    ),
    new View<{ jToken: JToken; input: StringV }>(
      `
        #### Decode

        * "Decode <jToken> input:<String>" - Prints information about a call to a jToken contract
      `,
      "Decode",
      [new Arg("jToken", getJTokenV), new Arg("input", getStringV)],
      (world, { jToken, input }) => decodeCall(world, jToken, input.val),
      { namePos: 1 }
    ),
  ];
}

export async function processJTokenEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>(
    "JToken",
    jTokenCommands(),
    world,
    event,
    from
  );
}
