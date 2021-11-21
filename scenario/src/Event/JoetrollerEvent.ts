import { Event } from "../Event";
import { addAction, describeUser, World } from "../World";
import { decodeCall, getPastEvents } from "../Contract";
import { Joetroller } from "../Contract/Joetroller";
import { JToken } from "../Contract/JToken";
import { invoke } from "../Invokation";
import {
  getAddressV,
  getBoolV,
  getEventV,
  getExpNumberV,
  getNumberV,
  getPercentV,
  getStringV,
  getCoreValue,
} from "../CoreValue";
import { AddressV, BoolV, EventV, NumberV, StringV } from "../Value";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { buildJoetrollerImpl } from "../Builder/JoetrollerImplBuilder";
import { JoetrollerErrorReporter } from "../ErrorReporter";
import { getJoetroller, getJoetrollerImpl } from "../ContractLookup";
import { getLiquidity } from "../Value/JoetrollerValue";
import { getJTokenV } from "../Value/JTokenValue";
import { encodeABI, rawValues } from "../Utils";

async function genJoetroller(
  world: World,
  from: string,
  params: Event
): Promise<World> {
  let {
    world: nextWorld,
    joetrollerImpl: joetroller,
    joetrollerImplData: joetrollerData,
  } = await buildJoetrollerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added Joetroller (${joetrollerData.description}) at address ${joetroller._address}`,
    joetrollerData.invokation
  );

  return world;
}

async function setPaused(
  world: World,
  from: string,
  joetroller: Joetroller,
  actionName: string,
  isPaused: boolean
): Promise<World> {
  const pauseMap = {
    Mint: joetroller.methods._setMintPaused,
  };

  if (!pauseMap[actionName]) {
    throw `Cannot find pause function for action "${actionName}"`;
  }

  let invokation = await invoke(
    world,
    joetroller[actionName]([isPaused]),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: set paused for ${actionName} to ${isPaused}`,
    invokation
  );

  return world;
}

async function setLiquidationIncentive(
  world: World,
  from: string,
  joetroller: Joetroller,
  liquidationIncentive: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setLiquidationIncentive(liquidationIncentive.encode()),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Set liquidation incentive to ${liquidationIncentive.show()}`,
    invokation
  );

  return world;
}

async function oldSupportMarket(
  world: World,
  from: string,
  joetroller: Joetroller,
  jToken: JToken
): Promise<World> {
  if (world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world.printer.printLine(
      `Dry run: Supporting market  \`${jToken._address}\``
    );
    return world;
  }

  let invokation = await invoke(
    world,
    joetroller.methods._supportMarket(jToken._address),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(world, `Supported market ${jToken.name}`, invokation);

  return world;
}

async function supportMarket(
  world: World,
  from: string,
  joetroller: Joetroller,
  jToken: JToken,
  version: NumberV
): Promise<World> {
  if (world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world.printer.printLine(
      `Dry run: Supporting market  \`${jToken._address}\``
    );
    return world;
  }

  let invokation = await invoke(
    world,
    joetroller.methods._supportMarket(jToken._address, version.encode()),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(world, `Supported market ${jToken.name}`, invokation);

  return world;
}

async function unlistMarket(
  world: World,
  from: string,
  joetroller: Joetroller,
  jToken: JToken
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods.unlist(jToken._address),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(world, `Unlisted market ${jToken.name}`, invokation);

  return world;
}

async function enterMarkets(
  world: World,
  from: string,
  joetroller: Joetroller,
  assets: string[]
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods.enterMarkets(assets),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Called enter assets ${assets} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function exitMarket(
  world: World,
  from: string,
  joetroller: Joetroller,
  asset: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods.exitMarket(asset),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Called exit market ${asset} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function updateJTokenVersion(
  world: World,
  from: string,
  joetroller: Joetroller,
  jToken: JToken,
  version: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods.updateJTokenVersion(jToken._address, version.encode()),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Update market ${jToken.name} version to ${version.show()}`,
    invokation
  );

  return world;
}

async function setPriceOracle(
  world: World,
  from: string,
  joetroller: Joetroller,
  priceOracleAddr: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setPriceOracle(priceOracleAddr),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Set price oracle for to ${priceOracleAddr} as ${describeUser(
      world,
      from
    )}`,
    invokation
  );

  return world;
}

async function setCollateralFactor(
  world: World,
  from: string,
  joetroller: Joetroller,
  jToken: JToken,
  collateralFactor: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setCollateralFactor(
      jToken._address,
      collateralFactor.encode()
    ),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Set collateral factor for ${jToken.name} to ${collateralFactor.show()}`,
    invokation
  );

  return world;
}

async function setCloseFactor(
  world: World,
  from: string,
  joetroller: Joetroller,
  closeFactor: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setCloseFactor(closeFactor.encode()),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Set close factor to ${closeFactor.show()}`,
    invokation
  );

  return world;
}

async function fastForward(
  world: World,
  from: string,
  joetroller: Joetroller,
  blocks: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods.fastForward(blocks.encode()),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Fast forward ${blocks.show()} blocks to #${invokation.value}`,
    invokation
  );

  return world;
}

async function printLiquidity(
  world: World,
  joetroller: Joetroller
): Promise<World> {
  let enterEvents = await getPastEvents(
    world,
    joetroller,
    "StdJoetroller",
    "MarketEntered"
  );
  let addresses = enterEvents.map((event) => event.returnValues["account"]);
  let uniq = [...new Set(addresses)];

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

async function setPendingAdmin(
  world: World,
  from: string,
  joetroller: Joetroller,
  newPendingAdmin: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setPendingAdmin(newPendingAdmin),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(
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
  joetroller: Joetroller
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._acceptAdmin(),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(world, from)} accepts admin`,
    invokation
  );

  return world;
}

async function setPauseGuardian(
  world: World,
  from: string,
  joetroller: Joetroller,
  newPauseGuardian: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setPauseGuardian(newPauseGuardian),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(
      world,
      from
    )} sets pause guardian to ${newPauseGuardian}`,
    invokation
  );

  return world;
}

async function setGuardianPaused(
  world: World,
  from: string,
  joetroller: Joetroller,
  action: string,
  state: boolean
): Promise<World> {
  let fun;
  switch (action) {
    case "Transfer":
      fun = joetroller.methods._setTransferPaused;
      break;
    case "Seize":
      fun = joetroller.methods._setSeizePaused;
      break;
  }
  let invokation = await invoke(
    world,
    fun(state),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(world, from)} sets ${action} paused`,
    invokation
  );

  return world;
}

async function setGuardianMarketPaused(
  world: World,
  from: string,
  joetroller: Joetroller,
  jToken: JToken,
  action: string,
  state: boolean
): Promise<World> {
  let fun;
  switch (action) {
    case "Mint":
      fun = joetroller.methods._setMintPaused;
      break;
    case "Borrow":
      fun = joetroller.methods._setBorrowPaused;
      break;
  }
  let invokation = await invoke(
    world,
    fun(jToken._address, state),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(world, from)} sets ${action} paused`,
    invokation
  );

  return world;
}

async function setMarketSupplyCaps(
  world: World,
  from: string,
  joetroller: Joetroller,
  jTokens: JToken[],
  supplyCaps: NumberV[]
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setMarketSupplyCaps(
      jTokens.map((c) => c._address),
      supplyCaps.map((c) => c.encode())
    ),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Supply caps on ${jTokens} set to ${supplyCaps}`,
    invokation
  );

  return world;
}

async function setSupplyCapGuardian(
  world: World,
  from: string,
  joetroller: Joetroller,
  newSupplyCapGuardian: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setSupplyCapGuardian(newSupplyCapGuardian),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(
      world,
      from
    )} sets supply cap guardian to ${newSupplyCapGuardian}`,
    invokation
  );

  return world;
}

async function setMarketBorrowCaps(
  world: World,
  from: string,
  joetroller: Joetroller,
  jTokens: JToken[],
  borrowCaps: NumberV[]
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setMarketBorrowCaps(
      jTokens.map((c) => c._address),
      borrowCaps.map((c) => c.encode())
    ),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Borrow caps on ${jTokens} set to ${borrowCaps}`,
    invokation
  );

  return world;
}

async function setBorrowCapGuardian(
  world: World,
  from: string,
  joetroller: Joetroller,
  newBorrowCapGuardian: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setBorrowCapGuardian(newBorrowCapGuardian),
    from,
    JoetrollerErrorReporter
  );

  world = addAction(
    world,
    `Joetroller: ${describeUser(
      world,
      from
    )} sets borrow cap guardian to ${newBorrowCapGuardian}`,
    invokation
  );

  return world;
}

async function setBlockTimestamp(
  world: World,
  from: string,
  joetroller: Joetroller,
  blockTimestamp: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods.setBlockTimestamp(blockTimestamp.encode()),
    from,
    JoetrollerErrorReporter
  );

  return addAction(
    world,
    `Set Governor blockTimestamp to ${blockTimestamp.show()}`,
    invokation
  );

  return world;
}

async function setCreditLimit(
  world: World,
  from: string,
  joetroller: Joetroller,
  protocol: string,
  creditLimit: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joetroller.methods._setCreditLimit(protocol, creditLimit.encode()),
    from,
    JoetrollerErrorReporter
  );

  return addAction(
    world,
    `Set ${protocol} credit limit to ${creditLimit.show()}`,
    invokation
  );
}

export function joetrollerCommands() {
  return [
    new Command<{ joetrollerParams: EventV }>(
      `
        #### Deploy

        * "Joetroller Deploy ...joetrollerParams" - Generates a new Joetroller (not as Impl)
          * E.g. "Joetroller Deploy YesNo"
      `,
      "Deploy",
      [new Arg("joetrollerParams", getEventV, { variadic: true })],
      (world, from, { joetrollerParams }) =>
        genJoetroller(world, from, joetrollerParams.val)
    ),
    new Command<{ joetroller: Joetroller; action: StringV; isPaused: BoolV }>(
      `
        #### SetPaused

        * "Joetroller SetPaused <Action> <Bool>" - Pauses or unpaused given jToken function
          * E.g. "Joetroller SetPaused "Mint" True"
      `,
      "SetPaused",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("action", getStringV),
        new Arg("isPaused", getBoolV),
      ],
      (world, from, { joetroller, action, isPaused }) =>
        setPaused(world, from, joetroller, action.val, isPaused.val)
    ),
    new Command<{ joetroller: Joetroller; jToken: JToken }>(
      `
        #### OldSupportMarket

        * "Joetroller OldSupportMarket <JToken>" - Adds support in the Joetroller for the given jToken
          * E.g. "Joetroller OldSupportMarket cZRX"
      `,
      "OldSupportMarket",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      (world, from, { joetroller, jToken }) =>
        oldSupportMarket(world, from, joetroller, jToken)
    ),
    new Command<{ joetroller: Joetroller; jToken: JToken; version: NumberV }>(
      `
        #### SupportMarket

        * "Joetroller SupportMarket <JToken> <Number>" - Adds support in the Joetroller for the given jToken
          * E.g. "Joetroller SupportMarket cZRX 0"
      `,
      "SupportMarket",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
        new Arg("version", getNumberV),
      ],
      (world, from, { joetroller, jToken, version }) =>
        supportMarket(world, from, joetroller, jToken, version)
    ),
    new Command<{ joetroller: Joetroller; jToken: JToken }>(
      `
        #### UnList

        * "Joetroller UnList <JToken>" - Mock unlists a given market in tests
          * E.g. "Joetroller UnList cZRX"
      `,
      "UnList",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      (world, from, { joetroller, jToken }) =>
        unlistMarket(world, from, joetroller, jToken)
    ),
    new Command<{ joetroller: Joetroller; jTokens: JToken[] }>(
      `
        #### EnterMarkets

        * "Joetroller EnterMarkets (<JToken> ...)" - User enters the given markets
          * E.g. "Joetroller EnterMarkets (cZRX cETH)"
      `,
      "EnterMarkets",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jTokens", getJTokenV, { mapped: true }),
      ],
      (world, from, { joetroller, jTokens }) =>
        enterMarkets(
          world,
          from,
          joetroller,
          jTokens.map((c) => c._address)
        )
    ),
    new Command<{ joetroller: Joetroller; jToken: JToken }>(
      `
        #### ExitMarket

        * "Joetroller ExitMarket <JToken>" - User exits the given markets
          * E.g. "Joetroller ExitMarket cZRX"
      `,
      "ExitMarket",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
      ],
      (world, from, { joetroller, jToken }) =>
        exitMarket(world, from, joetroller, jToken._address)
    ),
    new Command<{ joetroller: Joetroller; jToken: JToken; version: NumberV }>(
      `
        #### UpdateJTokenVersion

        * "Joetroller UpdateJTokenVersion <JToken> <Number>" - Update a JToken's version
          * E.g. "Joetroller UpdateJTokenVersion cZRX 1"
      `,
      "UpdateJTokenVersion",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
        new Arg("version", getNumberV),
      ],
      (world, from, { joetroller, jToken, version }) =>
        updateJTokenVersion(world, from, joetroller, jToken, version)
    ),
    new Command<{ joetroller: Joetroller; liquidationIncentive: NumberV }>(
      `
        #### LiquidationIncentive

        * "Joetroller LiquidationIncentive <Number>" - Sets the liquidation incentive
          * E.g. "Joetroller LiquidationIncentive 1.1"
      `,
      "LiquidationIncentive",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("liquidationIncentive", getExpNumberV),
      ],
      (world, from, { joetroller, liquidationIncentive }) =>
        setLiquidationIncentive(world, from, joetroller, liquidationIncentive)
    ),
    new Command<{ joetroller: Joetroller; priceOracle: AddressV }>(
      `
        #### SetPriceOracle

        * "Joetroller SetPriceOracle oracle:<Address>" - Sets the price oracle address
          * E.g. "Joetroller SetPriceOracle 0x..."
      `,
      "SetPriceOracle",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("priceOracle", getAddressV),
      ],
      (world, from, { joetroller, priceOracle }) =>
        setPriceOracle(world, from, joetroller, priceOracle.val)
    ),
    new Command<{
      joetroller: Joetroller;
      jToken: JToken;
      collateralFactor: NumberV;
    }>(
      `
        #### SetCollateralFactor

        * "Joetroller SetCollateralFactor <JToken> <Number>" - Sets the collateral factor for given jToken to number
          * E.g. "Joetroller SetCollateralFactor cZRX 0.1"
      `,
      "SetCollateralFactor",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
        new Arg("collateralFactor", getExpNumberV),
      ],
      (world, from, { joetroller, jToken, collateralFactor }) =>
        setCollateralFactor(world, from, joetroller, jToken, collateralFactor)
    ),
    new Command<{ joetroller: Joetroller; closeFactor: NumberV }>(
      `
        #### SetCloseFactor

        * "Joetroller SetCloseFactor <Number>" - Sets the close factor to given percentage
          * E.g. "Joetroller SetCloseFactor 0.2"
      `,
      "SetCloseFactor",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("closeFactor", getPercentV),
      ],
      (world, from, { joetroller, closeFactor }) =>
        setCloseFactor(world, from, joetroller, closeFactor)
    ),
    new Command<{ joetroller: Joetroller; newPendingAdmin: AddressV }>(
      `
        #### SetPendingAdmin

        * "Joetroller SetPendingAdmin newPendingAdmin:<Address>" - Sets the pending admin for the Joetroller
          * E.g. "Joetroller SetPendingAdmin Geoff"
      `,
      "SetPendingAdmin",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("newPendingAdmin", getAddressV),
      ],
      (world, from, { joetroller, newPendingAdmin }) =>
        setPendingAdmin(world, from, joetroller, newPendingAdmin.val)
    ),
    new Command<{ joetroller: Joetroller }>(
      `
        #### AcceptAdmin

        * "Joetroller AcceptAdmin" - Accepts admin for the Joetroller
          * E.g. "From Geoff (Joetroller AcceptAdmin)"
      `,
      "AcceptAdmin",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, from, { joetroller }) => acceptAdmin(world, from, joetroller)
    ),
    new Command<{ joetroller: Joetroller; newPauseGuardian: AddressV }>(
      `
        #### SetPauseGuardian

        * "Joetroller SetPauseGuardian newPauseGuardian:<Address>" - Sets the PauseGuardian for the Joetroller
          * E.g. "Joetroller SetPauseGuardian Geoff"
      `,
      "SetPauseGuardian",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("newPauseGuardian", getAddressV),
      ],
      (world, from, { joetroller, newPauseGuardian }) =>
        setPauseGuardian(world, from, joetroller, newPauseGuardian.val)
    ),

    new Command<{ joetroller: Joetroller; action: StringV; isPaused: BoolV }>(
      `
        #### SetGuardianPaused

        * "Joetroller SetGuardianPaused <Action> <Bool>" - Pauses or unpaused given jToken function
        * E.g. "Joetroller SetGuardianPaused "Transfer" True"
        `,
      "SetGuardianPaused",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("action", getStringV),
        new Arg("isPaused", getBoolV),
      ],
      (world, from, { joetroller, action, isPaused }) =>
        setGuardianPaused(world, from, joetroller, action.val, isPaused.val)
    ),

    new Command<{
      joetroller: Joetroller;
      jToken: JToken;
      action: StringV;
      isPaused: BoolV;
    }>(
      `
        #### SetGuardianMarketPaused

        * "Joetroller SetGuardianMarketPaused <JToken> <Action> <Bool>" - Pauses or unpaused given jToken function
        * E.g. "Joetroller SetGuardianMarketPaused cREP "Mint" True"
        `,
      "SetGuardianMarketPaused",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jToken", getJTokenV),
        new Arg("action", getStringV),
        new Arg("isPaused", getBoolV),
      ],
      (world, from, { joetroller, jToken, action, isPaused }) =>
        setGuardianMarketPaused(
          world,
          from,
          joetroller,
          jToken,
          action.val,
          isPaused.val
        )
    ),

    new Command<{ joetroller: Joetroller; blocks: NumberV; _keyword: StringV }>(
      `
        #### FastForward

        * "FastForward n:<Number> Blocks" - Moves the block number forward "n" blocks. Note: in "JTokenScenario" and "JoetrollerScenario" the current block number is mocked (starting at 100000). This is the only way for the protocol to see a higher block number (for accruing interest).
          * E.g. "Joetroller FastForward 5 Blocks" - Move block number forward 5 blocks.
      `,
      "FastForward",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("blocks", getNumberV),
        new Arg("_keyword", getStringV),
      ],
      (world, from, { joetroller, blocks }) =>
        fastForward(world, from, joetroller, blocks)
    ),
    new View<{ joetroller: Joetroller }>(
      `
        #### Liquidity

        * "Joetroller Liquidity" - Prints liquidity of all minters or borrowers
      `,
      "Liquidity",
      [new Arg("joetroller", getJoetroller, { implicit: true })],
      (world, { joetroller }) => printLiquidity(world, joetroller)
    ),
    new View<{ joetroller: Joetroller; input: StringV }>(
      `
        #### Decode

        * "Decode input:<String>" - Prints information about a call to a Joetroller contract
      `,
      "Decode",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("input", getStringV),
      ],
      (world, { joetroller, input }) => decodeCall(world, joetroller, input.val)
    ),
    new Command<{
      joetroller: Joetroller;
      jTokens: JToken[];
      supplyCaps: NumberV[];
    }>(
      `
      #### SetMarketSupplyCaps

      * "Joetroller SetMarketSupplyCaps (<JToken> ...) (<supplyCap> ...)" - Sets Market Supply Caps
      * E.g. "Joetroller SetMarketSupplyCaps (cZRX cUSDC) (10000.0e18, 1000.0e6)
      `,
      "SetMarketSupplyCaps",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jTokens", getJTokenV, { mapped: true }),
        new Arg("supplyCaps", getNumberV, { mapped: true }),
      ],
      (world, from, { joetroller, jTokens, supplyCaps }) =>
        setMarketSupplyCaps(world, from, joetroller, jTokens, supplyCaps)
    ),
    new Command<{ joetroller: Joetroller; newSupplyCapGuardian: AddressV }>(
      `
      #### SetSupplyCapGuardian

        * "Joetroller SetSupplyCapGuardian newSupplyCapGuardian:<Address>" - Sets the Supply Cap Guardian for the Joetroller
          * E.g. "Joetroller SetSupplyCapGuardian Geoff"
      `,
      "SetSupplyCapGuardian",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("newSupplyCapGuardian", getAddressV),
      ],
      (world, from, { joetroller, newSupplyCapGuardian }) =>
        setSupplyCapGuardian(world, from, joetroller, newSupplyCapGuardian.val)
    ),
    new Command<{
      joetroller: Joetroller;
      jTokens: JToken[];
      borrowCaps: NumberV[];
    }>(
      `
      #### SetMarketBorrowCaps

      * "Joetroller SetMarketBorrowCaps (<JToken> ...) (<borrowCap> ...)" - Sets Market Borrow Caps
      * E.g "Joetroller SetMarketBorrowCaps (cZRX cUSDC) (10000.0e18, 1000.0e6)
      `,
      "SetMarketBorrowCaps",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("jTokens", getJTokenV, { mapped: true }),
        new Arg("borrowCaps", getNumberV, { mapped: true }),
      ],
      (world, from, { joetroller, jTokens, borrowCaps }) =>
        setMarketBorrowCaps(world, from, joetroller, jTokens, borrowCaps)
    ),
    new Command<{ joetroller: Joetroller; newBorrowCapGuardian: AddressV }>(
      `
        #### SetBorrowCapGuardian

        * "Joetroller SetBorrowCapGuardian newBorrowCapGuardian:<Address>" - Sets the Borrow Cap Guardian for the Joetroller
          * E.g. "Joetroller SetBorrowCapGuardian Geoff"
      `,
      "SetBorrowCapGuardian",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("newBorrowCapGuardian", getAddressV),
      ],
      (world, from, { joetroller, newBorrowCapGuardian }) =>
        setBorrowCapGuardian(world, from, joetroller, newBorrowCapGuardian.val)
    ),
    new Command<{ joetroller: Joetroller; blockTimestamp: NumberV }>(
      `
        #### SetBlockTimestamp

        * "Joetroller SetBlockTimestamp <BlockTimestamp>" - Sets the blockTimestamp of the Joetroller
        * E.g. "Joetroller SetBlockTimestamp 500"
      `,
      "SetBlockTimestamp",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("blockTimestamp", getNumberV),
      ],
      (world, from, { joetroller, blockTimestamp }) =>
        setBlockTimestamp(world, from, joetroller, blockTimestamp)
    ),
    new Command<{
      joetroller: Joetroller;
      protocol: AddressV;
      creditLimit: NumberV;
    }>(
      `
        #### SetCreditLimit

        * "Joetroller SetCreditLimit <Protocol> <CreditLimit>" - Sets the credit limit of a protocol
        * E.g. "Joetroller SetCreditLimit Geoff 100"
      `,
      "SetCreditLimit",
      [
        new Arg("joetroller", getJoetroller, { implicit: true }),
        new Arg("protocol", getAddressV),
        new Arg("creditLimit", getNumberV),
      ],
      (world, from, { joetroller, protocol, creditLimit }) =>
        setCreditLimit(world, from, joetroller, protocol.val, creditLimit)
    ),
  ];
}

export async function processJoetrollerEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>(
    "Joetroller",
    joetrollerCommands(),
    world,
    event,
    from
  );
}
