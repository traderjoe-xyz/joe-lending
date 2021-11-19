import { Event } from "../Event";
import { addAction, World, describeUser } from "../World";
import { Joe, JoeScenario } from "../Contract/Joe";
import { buildJoe } from "../Builder/JoeBuilder";
import { invoke } from "../Invokation";
import { getAddressV, getEventV, getNumberV, getStringV } from "../CoreValue";
import { AddressV, EventV, NumberV, StringV } from "../Value";
import { Arg, Command, processCommandEvent, View } from "../Command";
import { getJoe } from "../ContractLookup";
import { NoErrorReporter } from "../ErrorReporter";
import { verify } from "../Verify";
import { encodedNumber } from "../Encoding";

async function genJoe(
  world: World,
  from: string,
  params: Event
): Promise<World> {
  let {
    world: nextWorld,
    joe,
    tokenData,
  } = await buildJoe(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed Joe (${joe.name}) to address ${joe._address}`,
    tokenData.invokation
  );

  return world;
}

async function verifyJoe(
  world: World,
  joe: Joe,
  apiKey: string,
  modelName: string,
  contractName: string
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(
      `Politely declining to verify on local network: ${world.network}.`
    );
  } else {
    await verify(world, apiKey, modelName, contractName, joe._address);
  }

  return world;
}

async function approve(
  world: World,
  from: string,
  joe: Joe,
  address: string,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joe.methods.approve(address, amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Approved Joe token for ${from} of ${amount.show()}`,
    invokation
  );

  return world;
}

async function transfer(
  world: World,
  from: string,
  joe: Joe,
  address: string,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joe.methods.transfer(address, amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Transferred ${amount.show()} Joe tokens from ${from} to ${address}`,
    invokation
  );

  return world;
}

async function transferFrom(
  world: World,
  from: string,
  joe: Joe,
  owner: string,
  spender: string,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joe.methods.transferFrom(owner, spender, amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `"Transferred from" ${amount.show()} Joe tokens from ${owner} to ${spender}`,
    invokation
  );

  return world;
}

async function transferScenario(
  world: World,
  from: string,
  joe: JoeScenario,
  addresses: string[],
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joe.methods.transferScenario(addresses, amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Transferred ${amount.show()} Joe tokens from ${from} to ${addresses}`,
    invokation
  );

  return world;
}

async function transferFromScenario(
  world: World,
  from: string,
  joe: JoeScenario,
  addresses: string[],
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    joe.methods.transferFromScenario(addresses, amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Transferred ${amount.show()} Joe tokens from ${addresses} to ${from}`,
    invokation
  );

  return world;
}

async function delegate(
  world: World,
  from: string,
  joe: Joe,
  account: string
): Promise<World> {
  let invokation = await invoke(
    world,
    joe.methods.delegate(account),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `"Delegated from" ${from} to ${account}`,
    invokation
  );

  return world;
}

async function setBlockNumber(
  world: World,
  from: string,
  joe: Joe,
  blockNumber: NumberV
): Promise<World> {
  return addAction(
    world,
    `Set Joe blockNumber to ${blockNumber.show()}`,
    await invoke(world, joe.methods.setBlockNumber(blockNumber.encode()), from)
  );
}

export function joeCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new Joe token
          * E.g. "Joe Deploy"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genJoe(world, from, params.val)
    ),

    new View<{ joe: Joe; apiKey: StringV; contractName: StringV }>(
      `
        #### Verify

        * "<Joe> Verify apiKey:<String> contractName:<String>=Joe" - Verifies Joe token in Etherscan
          * E.g. "Joe Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("apiKey", getStringV),
        new Arg("contractName", getStringV, { default: new StringV("Joe") }),
      ],
      async (world, { joe, apiKey, contractName }) => {
        return await verifyJoe(
          world,
          joe,
          apiKey.val,
          joe.name,
          contractName.val
        );
      }
    ),

    new Command<{ joe: Joe; spender: AddressV; amount: NumberV }>(
      `
        #### Approve

        * "Joe Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "Joe Approve Geoff 1.0e18"
      `,
      "Approve",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { joe, spender, amount }) => {
        return approve(world, from, joe, spender.val, amount);
      }
    ),

    new Command<{ joe: Joe; recipient: AddressV; amount: NumberV }>(
      `
        #### Transfer

        * "Joe Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "Joe Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { joe, recipient, amount }) =>
        transfer(world, from, joe, recipient.val, amount)
    ),

    new Command<{
      joe: Joe;
      owner: AddressV;
      spender: AddressV;
      amount: NumberV;
    }>(
      `
        #### TransferFrom

        * "Joe TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "Joe TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { joe, owner, spender, amount }) =>
        transferFrom(world, from, joe, owner.val, spender.val, amount)
    ),

    new Command<{ joe: JoeScenario; recipients: AddressV[]; amount: NumberV }>(
      `
        #### TransferScenario

        * "Joe TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "Joe TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("recipients", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { joe, recipients, amount }) =>
        transferScenario(
          world,
          from,
          joe,
          recipients.map((recipient) => recipient.val),
          amount
        )
    ),

    new Command<{ joe: JoeScenario; froms: AddressV[]; amount: NumberV }>(
      `
        #### TransferFromScenario

        * "Joe TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "Joe TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("froms", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { joe, froms, amount }) =>
        transferFromScenario(
          world,
          from,
          joe,
          froms.map((_from) => _from.val),
          amount
        )
    ),

    new Command<{ joe: Joe; account: AddressV }>(
      `
        #### Delegate

        * "Joe Delegate account:<Address>" - Delegates votes to a given account
          * E.g. "Joe Delegate Torrey"
      `,
      "Delegate",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, from, { joe, account }) => delegate(world, from, joe, account.val)
    ),
    new Command<{ joe: Joe; blockNumber: NumberV }>(
      `
      #### SetBlockNumber

      * "SetBlockNumber <Seconds>" - Sets the blockNumber of the Joe Harness
      * E.g. "Joe SetBlockNumber 500"
      `,
      "SetBlockNumber",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("blockNumber", getNumberV),
      ],
      (world, from, { joe, blockNumber }) =>
        setBlockNumber(world, from, joe, blockNumber)
    ),
  ];
}

export async function processJoeEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>(
    "Joe",
    joeCommands(),
    world,
    event,
    from
  );
}
